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

export class TerrainClient {
  private readonly worker: Worker;
  private readonly ring = new SlabRing();
  private readonly ready: ChunkMesh[] = [];
  private readonly idleWaiters: Array<() => void> = [];
  private evictBelowCz = -Infinity;
  generated = 0;
  generateMs = 0;

  constructor(seed: number) {
    this.worker = new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.onMessage(e.data);
    this.send({ type: 'seed', seed: seed >>> 0 });
  }

  private send(msg: ToWorker): void {
    this.worker.postMessage(msg);
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
    if (plan.cancelBelow !== null) this.send({ type: 'cancelBelow', cz: plan.cancelBelow });
    for (const cz of plan.request) this.send({ type: 'build', cz });
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
    this.worker.terminate();
  }
}
