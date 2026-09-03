// Chunk builder: fills the sample grid with the shell skip, meshes it and bakes
// colours. Output is a pure function of (seed, cx, cy, cz).
import { blendAt } from './biomes.ts';
import { faceColour } from './colour.ts';
import { FieldContext } from './field.ts';
import {
  CELL_SIZE,
  CHUNK_SIZE,
  createMarchOutput,
  GRID_LENGTH,
  gridIndex,
  march,
  SAMPLES,
} from './march.ts';
import type { MarchOutput } from './march.ts';
import { hash3 } from './noise.ts';
import { shellBound } from './params.ts';
import type { Spine } from './spine.ts';
import { createSpine, spine } from './spine.ts';

export interface ChunkMesh {
  cx: number;
  cy: number;
  cz: number;
  tris: number;
  /** Chunk-local positions, 9 floats per triangle. */
  pos: Float32Array;
  /** 4 bytes per vertex, 12 per triangle. */
  rgba: Uint8Array;
}

export interface ChunkScratch {
  grid: Float64Array;
  ctx: FieldContext | null;
  ctxSeed: number;
  out: MarchOutput;
  rgba: Uint8Array;
  /** Statistics of the last fill: full evaluations and base-only samples. */
  full: number;
  baseOnly: number;
}

export function createChunkScratch(): ChunkScratch {
  const out = createMarchOutput();
  return {
    grid: new Float64Array(GRID_LENGTH),
    ctx: null,
    ctxSeed: -1,
    out,
    rgba: new Uint8Array(out.capacity * 12),
    full: 0,
    baseOnly: 0,
  };
}

function contextFor(seed: number, s: ChunkScratch): FieldContext {
  if (!s.ctx || s.ctxSeed !== seed) {
    s.ctx = new FieldContext(seed);
    s.ctxSeed = seed;
  }
  return s.ctx;
}

const CELL_DIAG = Math.sqrt(3) * CELL_SIZE;

/** Fills the 33³ grid for chunk (cx, cy, cz). Deep rock and deep air skip the detail terms. */
export function fillGrid(seed: number, cx: number, cy: number, cz: number, s: ChunkScratch): void {
  const ox = cx * CHUNK_SIZE;
  const oy = cy * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
  const ctx = contextFor(seed, s);
  ctx.setBox(ox, ox + CHUNK_SIZE, oz, oz + CHUNK_SIZE);
  const grid = s.grid;
  let full = 0;
  let baseOnly = 0;
  for (let z = 0; z < SAMPLES; z++) {
    const wz = oz + z * CELL_SIZE;
    ctx.at(wz);
    const { a, b, t } = ctx.blend;
    const bound = Math.max(shellBound(a.params), t > 0 ? shellBound(b.params) : 0) + CELL_DIAG;
    for (let y = 0; y < SAMPLES; y++) {
      const wy = oy + y * CELL_SIZE;
      for (let x = 0; x < SAMPLES; x++) {
        const wx = ox + x * CELL_SIZE;
        const base = ctx.base(wx, wy);
        const i = gridIndex(x, y, z);
        if (base > bound) {
          grid[i] = Math.min(base, ctx.core(wx, wy));
          baseOnly++;
        } else if (base < -bound) {
          grid[i] = Math.max(base, ctx.featureRock(wx, wy, wz));
          baseOnly++;
        } else {
          grid[i] = ctx.density(wx, wy, wz);
          full++;
        }
      }
    }
  }
  s.full = full;
  s.baseOnly = baseOnly;
}

/** Corridor envelope for slab cz, padded by the shell bound. */
export function slabEnvelope(
  seed: number,
  cz: number,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const oz = cz * CHUNK_SIZE;
  const sp = createSpine();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let pad = 0;
  for (let z = 0; z <= SAMPLES - 1; z += 4) {
    const wz = oz + z * CELL_SIZE;
    const bl = blendAt(seed, wz);
    for (const p of bl.a === bl.b || bl.t === 0 ? [bl.a.params] : [bl.a.params, bl.b.params]) {
      spine(seed, wz, p, sp);
      const reach = sp.hw * (1 + p.profileLip);
      minX = Math.min(minX, sp.cx - reach);
      maxX = Math.max(maxX, sp.cx + reach);
      minY = Math.min(minY, sp.floorY);
      maxY = Math.max(maxY, sp.ceilY);
      pad = Math.max(pad, shellBound(p) + 8);
    }
  }
  return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
}

/** Chunk coordinates (cx, cy) in slab cz that can contain surface, nearest to the spine first. */
export function slabCandidates(seed: number, cz: number): Array<[number, number]> {
  const e = slabEnvelope(seed, cz);
  const cx0 = Math.floor(e.minX / CHUNK_SIZE);
  const cx1 = Math.floor(e.maxX / CHUNK_SIZE);
  const cy0 = Math.floor(e.minY / CHUNK_SIZE);
  const cy1 = Math.floor(e.maxY / CHUNK_SIZE);
  const midX = (e.minX + e.maxX) * 0.5;
  const midY = (e.minY + e.maxY) * 0.5;
  const list: Array<[number, number]> = [];
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) list.push([cx, cy]);
  const dist = ([cx, cy]: [number, number]): number => {
    const dx = (cx + 0.5) * CHUNK_SIZE - midX;
    const dy = (cy + 0.5) * CHUNK_SIZE - midY;
    return dx * dx + dy * dy;
  };
  return list.sort((a, b) => dist(a) - dist(b) || a[1] - b[1] || a[0] - b[0]);
}

export function chunkKey(cx: number, cy: number, cz: number): number {
  return hash3(cx, cy, cz, 0x51ab);
}

/** Builds the coloured mesh of a chunk, or null when it has no surface. */
export function buildChunk(
  seed: number,
  cx: number,
  cy: number,
  cz: number,
  s: ChunkScratch,
): ChunkMesh | null {
  fillGrid(seed, cx, cy, cz, s);
  const tris = march(s.grid, s.out);
  if (tris === 0) return null;
  const ox = cx * CHUNK_SIZE;
  const oy = cy * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
  const key = chunkKey(cx, cy, cz);
  const pos = s.out.pos;
  const rgba = s.rgba;
  const sp: Spine = createSpine();
  const ctx = contextFor(seed, s);
  for (let t = 0; t < tris; t++) {
    const o = t * 9;
    const ax = pos[o]!;
    const ay = pos[o + 1]!;
    const az = pos[o + 2]!;
    const ux = pos[o + 3]! - ax;
    const uy = pos[o + 4]! - ay;
    const uz = pos[o + 5]! - az;
    const vx = pos[o + 6]! - ax;
    const vy = pos[o + 7]! - ay;
    const vz = pos[o + 8]! - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    const nyn = len > 0 ? ny / len : 0;
    const wx = ox + (ax + pos[o + 3]! + pos[o + 6]!) / 3;
    const wy = oy + (ay + pos[o + 4]! + pos[o + 7]!) / 3;
    const wz = oz + (az + pos[o + 5]! + pos[o + 8]!) / 3;
    ctx.at(wz);
    const { a, b, t: bt } = ctx.blend;
    const params = a === b || bt === 0 ? a.params : ctx.blend.params;
    spine(seed, wz, params, sp);
    faceColour(
      seed,
      params,
      a.palette,
      b.palette,
      bt,
      sp,
      wx,
      wy,
      wz,
      nyn,
      s.out.cellTri[t]!,
      key,
      rgba,
      t * 12,
    );
    rgba.copyWithin(t * 12 + 4, t * 12, t * 12 + 4);
    rgba.copyWithin(t * 12 + 8, t * 12, t * 12 + 4);
  }
  return { cx, cy, cz, tris, pos: pos.slice(0, tris * 9), rgba: rgba.slice(0, tris * 12) };
}
