// Keeps the renderer's chunk set in step with the plane: asks the terrain client
// for the ring around the current slab, uploads delivered chunks (budgeted per
// frame in real time, all at once when settling), and evicts behind.
import type { GameRenderer } from '../render/renderer.ts';
import { CHUNK_SIZE } from '../terrain/march.ts';
import { TerrainClient } from './terrainClient.ts';

export const UPLOADS_PER_FRAME = 4;

export class World {
  seed: number;
  private readonly renderer: GameRenderer;
  private terrain: TerrainClient;

  private readonly workers: number | undefined;
  mode: number;

  constructor(seed: number, renderer: GameRenderer, workers?: number, mode = 0) {
    this.seed = seed;
    this.mode = mode;
    this.renderer = renderer;
    this.workers = workers;
    this.terrain = new TerrainClient(seed, workers, mode);
  }

  /** Same seed keeps the chunk cache; a new seed replaces the worker and clears meshes. */
  reset(seed: number, mode = this.mode): void {
    if (seed === this.seed && mode === this.mode) return;
    this.terrain.dispose();
    this.renderer.evictBelow(Infinity);
    this.seed = seed;
    this.mode = mode;
    this.terrain = new TerrainClient(seed, this.workers, mode);
  }

  /** Real-time update: plan for z, upload a few chunks, evict behind. */
  update(z: number, maxUploads = UPLOADS_PER_FRAME): void {
    const s = Math.floor(z / CHUNK_SIZE);
    const evictBelow = this.terrain.setSlab(s);
    for (const chunk of this.terrain.takeReady(maxUploads)) this.renderer.addChunk(chunk);
    this.renderer.evictBelow(evictBelow);
  }

  /** Waits for the whole ring, then uploads everything (deterministic frames). */
  async settle(z: number): Promise<void> {
    this.update(z, 0);
    await this.terrain.whenIdle();
    this.update(z, Infinity);
  }

  stats(): {
    resident: number;
    generated: number;
    ms: number;
    triangles: number;
    pending: number;
    slabs: number;
    workers: number;
  } {
    const t = this.terrain.stats();
    return {
      resident: this.renderer.chunkCount,
      generated: t.generated,
      ms: t.ms,
      triangles: this.renderer.triangleCount(),
      pending: t.pending,
      slabs: t.resident,
      workers: this.terrain.workerTotal,
    };
  }

  dispose(): void {
    this.terrain.dispose();
  }
}
