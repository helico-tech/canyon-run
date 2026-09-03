// Main-thread side of the terrain worker: plans the ring, forwards requests,
// buffers delivered chunks, and can wait until the ring is complete (test mode).
import type { ChunkMesh } from '../terrain/chunk.ts';
import type { FromWorker, ToWorker } from '../terrain/worker-protocol.ts';
import { SlabRing } from './slabRing.ts';

export interface TerrainStats {
  resident: number;
  pending: number;
  generated: number;
  ms: number;
}

/** Workers to run: slabs are dealt round-robin (even/odd), halving wall time per slab on 4+ cores. */
export function workerCount(): number {
  const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 2) : 2;
  return cores >= 4 ? 2 : 1;
}

export class TerrainClient {
  private readonly workers: Worker[] = [];
  private readonly ring = new SlabRing();
  private readonly ready: ChunkMesh[] = [];
  private readonly idleWaiters: Array<() => void> = [];
  private evictBelowCz = -Infinity;
  generated = 0;
  generateMs = 0;

  constructor(seed: number, workers: number = workerCount()) {
    workers = Math.max(1, Math.min(4, Math.floor(workers || workerCount())));
    for (let i = 0; i < workers; i++) {
      const w = new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<FromWorker>) => this.onMessage(e.data);
      this.workers.push(w);
    }
    this.broadcast({ type: 'seed', seed: seed >>> 0 });
  }

  private broadcast(msg: ToWorker): void {
    for (const w of this.workers) w.postMessage(msg);
  }

  /** Slab cz goes to worker cz mod n (negative slabs wrap correctly). */
  private sendBuild(cz: number): void {
    const n = this.workers.length;
    const i = ((cz % n) + n) % n;
    this.workers[i]!.postMessage({ type: 'build', cz } satisfies ToWorker);
  }

  private onMessage(msg: FromWorker): void {
    if (msg.type === 'chunk') {
      if (msg.cz < this.evictBelowCz) return;
      this.ready.push({
        cx: msg.cx,
        cy: msg.cy,
        cz: msg.cz,
        tris: msg.tris,
        pos: msg.pos,
        rgba: msg.rgba,
      });
      this.generated++;
    } else if (msg.type === 'slabDone') {
      this.generateMs += msg.ms;
      this.ring.markDone(msg.cz);
      if (this.ring.idle) for (const w of this.idleWaiters.splice(0)) w();
    }
  }

  /** Tells the planner where the plane is; returns the slab below which meshes should be evicted. */
  setSlab(s: number): number {
    const plan = this.ring.setSlab(s);
    if (plan.cancelBelow !== null) this.broadcast({ type: 'cancelBelow', cz: plan.cancelBelow });
    for (const cz of plan.request) this.sendBuild(cz);
    this.evictBelowCz = plan.evictBelow;
    for (let i = this.ready.length - 1; i >= 0; i--)
      if (this.ready[i]!.cz < plan.evictBelow) this.ready.splice(i, 1);
    return plan.evictBelow;
  }

  /** Delivered chunks not yet taken, up to `max` (Infinity for all). */
  takeReady(max = Infinity): ChunkMesh[] {
    return this.ready.splice(0, Math.min(max, this.ready.length));
  }

  /** Resolves once every requested slab has been delivered. */
  whenIdle(): Promise<void> {
    if (this.ring.idle) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  stats(): TerrainStats {
    return {
      resident: this.ring.residentSlabs,
      pending: this.ring.pending,
      generated: this.generated,
      ms: Math.round(this.generateMs),
    };
  }

  dispose(): void {
    for (const w of this.workers) w.terminate();
  }

  get workerTotal(): number {
    return this.workers.length;
  }
}
