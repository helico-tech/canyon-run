// Renderer stand-in for sim-only runs (cross-engine tests in browsers without WebGL).
import type { ChunkMesh } from '../terrain/chunk.ts';
import type { Atmosphere } from './atmosphere.ts';
import type { RenderPose } from './camera.ts';
import type { GameRenderer } from './renderer.ts';

export class NullRenderer implements GameRenderer {
  readonly info = { renderer: 'none', vendor: 'none', version: 'none' };
  private readonly chunks = new Map<string, number>();

  setAtmosphere(_a: Atmosphere): void {}
  setSeed(_seed: number): void {}
  addChunk(chunk: ChunkMesh): void {
    this.chunks.set(`${chunk.cx},${chunk.cy},${chunk.cz}`, chunk.tris);
  }
  hasChunk(cx: number, cy: number, cz: number): boolean {
    return this.chunks.has(`${cx},${cy},${cz}`);
  }
  removeChunk(cx: number, cy: number, cz: number): void {
    this.chunks.delete(`${cx},${cy},${cz}`);
  }
  evictBelow(minCz: number): number {
    let n = 0;
    for (const id of this.chunks.keys()) {
      if (Number(id.split(',')[2]) < minCz) {
        this.chunks.delete(id);
        n++;
      }
    }
    return n;
  }
  get chunkCount(): number {
    return this.chunks.size;
  }
  triangleCount(): number {
    let n = 0;
    for (const t of this.chunks.values()) n += t;
    return n;
  }
  resize(_w: number, _h: number): void {}
  render(_pose: RenderPose): void {}
  readPixel(_x: number, _y: number): [number, number, number, number] {
    return [0, 0, 0, 0];
  }
  frameHash(): number {
    return 0;
  }
  dispose(): void {
    this.chunks.clear();
  }
}
