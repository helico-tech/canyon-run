// In-thread world assembly for the bootstrap: keeps a ring of slabs resident by
// building chunks synchronously. CR-0010 moves generation to a worker.
import type { Renderer } from '../render/renderer.ts';
import { buildChunk, createChunkScratch, slabCandidates } from '../terrain/chunk.ts';
import { CHUNK_SIZE } from '../terrain/march.ts';

export const SLABS_BEHIND = 1;
export const SLABS_AHEAD = 10;

export class World {
  readonly seed: number;
  private readonly renderer: Renderer;
  private readonly scratch = createChunkScratch();
  private readonly built = new Set<number>();
  generatedChunks = 0;
  generateMs = 0;

  constructor(seed: number, renderer: Renderer) {
    this.seed = seed;
    this.renderer = renderer;
  }

  private buildSlab(cz: number): void {
    if (this.built.has(cz)) return;
    const t0 = performance.now();
    for (const [cx, cy] of slabCandidates(this.seed, cz)) {
      const mesh = buildChunk(this.seed, cx, cy, cz, this.scratch);
      if (mesh) {
        this.renderer.addChunk(mesh);
        this.generatedChunks++;
      }
    }
    this.built.add(cz);
    this.generateMs += performance.now() - t0;
  }

  /** Ensures slabs [s − 1, s + 10] exist around the plane's z and evicts older ones. */
  update(z: number): void {
    const s = Math.floor(z / CHUNK_SIZE);
    for (let cz = s - SLABS_BEHIND; cz <= s + SLABS_AHEAD; cz++) this.buildSlab(cz);
    for (const cz of this.built) if (cz < s - SLABS_BEHIND) this.built.delete(cz);
    this.renderer.evictBelow(s - SLABS_BEHIND);
  }

  stats(): { resident: number; generated: number; ms: number; triangles: number } {
    return {
      resident: this.renderer.chunkCount,
      generated: this.generatedChunks,
      ms: Math.round(this.generateMs),
      triangles: this.renderer.triangleCount(),
    };
  }
}
