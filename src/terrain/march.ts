// Marching cubes over a 33³ sample grid, non-indexed output in chunk-local units.
// Cube-index bit i is set when corner i is ROCK (d > 0); the generated tables wind
// triangles so that they face the air (see mc-tables.ts).
import { MC_TABLES } from './mc-tables.ts';

export const CELLS = 32;
export const SAMPLES = CELLS + 1;
export const CELL_SIZE = 2;
export const CHUNK_SIZE = CELLS * CELL_SIZE;
export const GRID_LENGTH = SAMPLES * SAMPLES * SAMPLES;
/** Real canyon chunks peak around 5 000 triangles (research 03 §4.3). */
export const MAX_TRIS_PER_CHUNK = 12000;

export function gridIndex(x: number, y: number, z: number): number {
  return x + SAMPLES * (y + SAMPLES * z);
}

export interface MarchOutput {
  /** Chunk-local positions, 9 floats per triangle. */
  pos: Float32Array;
  /** `cellIndex * 8 + triangleInCell` per triangle, for hashed per-face jitter. */
  cellTri: Int32Array;
  tris: number;
  capacity: number;
}

export function createMarchOutput(capacity = MAX_TRIS_PER_CHUNK): MarchOutput {
  return {
    pos: new Float32Array(capacity * 9),
    cellTri: new Int32Array(capacity),
    tris: 0,
    capacity,
  };
}

const ex = new Float64Array(12 * 3);

/**
 * Meshes `grid` (index `gridIndex(x,y,z)`, values > 0 are rock) into `out`.
 * Edge vertices are always interpolated from the lower to the higher coordinate
 * along the edge axis, so two cubes sharing an edge produce identical bits.
 */
export function march(grid: Float64Array, out: MarchOutput): number {
  const { edgeTable, triTable } = MC_TABLES;
  const pos = out.pos;
  const S = SAMPLES;
  const C = CELL_SIZE;
  let t = 0;
  for (let z = 0; z < CELLS; z++) {
    for (let y = 0; y < CELLS; y++) {
      for (let x = 0; x < CELLS; x++) {
        const i0 = x + S * (y + S * z);
        const d0 = grid[i0]!;
        const d1 = grid[i0 + 1]!;
        const d2 = grid[i0 + 1 + S]!;
        const d3 = grid[i0 + S]!;
        const d4 = grid[i0 + S * S]!;
        const d5 = grid[i0 + 1 + S * S]!;
        const d6 = grid[i0 + 1 + S + S * S]!;
        const d7 = grid[i0 + S + S * S]!;
        let c = 0;
        if (d0 > 0) c |= 1;
        if (d1 > 0) c |= 2;
        if (d2 > 0) c |= 4;
        if (d3 > 0) c |= 8;
        if (d4 > 0) c |= 16;
        if (d5 > 0) c |= 32;
        if (d6 > 0) c |= 64;
        if (d7 > 0) c |= 128;
        const em = edgeTable[c]!;
        if (em === 0) continue;
        const wx = x * C;
        const wy = y * C;
        const wz = z * C;
        if (em & 1) {
          const s = d0 / (d0 - d1);
          ex[0] = wx + s * C;
          ex[1] = wy;
          ex[2] = wz;
        }
        if (em & 2) {
          const s = d1 / (d1 - d2);
          ex[3] = wx + C;
          ex[4] = wy + s * C;
          ex[5] = wz;
        }
        if (em & 4) {
          const s = d3 / (d3 - d2);
          ex[6] = wx + s * C;
          ex[7] = wy + C;
          ex[8] = wz;
        }
        if (em & 8) {
          const s = d0 / (d0 - d3);
          ex[9] = wx;
          ex[10] = wy + s * C;
          ex[11] = wz;
        }
        if (em & 16) {
          const s = d4 / (d4 - d5);
          ex[12] = wx + s * C;
          ex[13] = wy;
          ex[14] = wz + C;
        }
        if (em & 32) {
          const s = d5 / (d5 - d6);
          ex[15] = wx + C;
          ex[16] = wy + s * C;
          ex[17] = wz + C;
        }
        if (em & 64) {
          const s = d7 / (d7 - d6);
          ex[18] = wx + s * C;
          ex[19] = wy + C;
          ex[20] = wz + C;
        }
        if (em & 128) {
          const s = d4 / (d4 - d7);
          ex[21] = wx;
          ex[22] = wy + s * C;
          ex[23] = wz + C;
        }
        if (em & 256) {
          const s = d0 / (d0 - d4);
          ex[24] = wx;
          ex[25] = wy;
          ex[26] = wz + s * C;
        }
        if (em & 512) {
          const s = d1 / (d1 - d5);
          ex[27] = wx + C;
          ex[28] = wy;
          ex[29] = wz + s * C;
        }
        if (em & 1024) {
          const s = d2 / (d2 - d6);
          ex[30] = wx + C;
          ex[31] = wy + C;
          ex[32] = wz + s * C;
        }
        if (em & 2048) {
          const s = d3 / (d3 - d7);
          ex[33] = wx;
          ex[34] = wy + C;
          ex[35] = wz + s * C;
        }
        const base = c * 16;
        const cell = x + CELLS * (y + CELLS * z);
        for (let k = 0; k < 16 && triTable[base + k] !== -1; k += 3) {
          if (t >= out.capacity) {
            throw new Error(
              `marching cubes: triangle cap ${out.capacity} exceeded in cell ${cell}`,
            );
          }
          const a = triTable[base + k]! * 3;
          const b = triTable[base + k + 1]! * 3;
          const cc = triTable[base + k + 2]! * 3;
          const o = t * 9;
          pos[o] = ex[a]!;
          pos[o + 1] = ex[a + 1]!;
          pos[o + 2] = ex[a + 2]!;
          pos[o + 3] = ex[b]!;
          pos[o + 4] = ex[b + 1]!;
          pos[o + 5] = ex[b + 2]!;
          pos[o + 6] = ex[cc]!;
          pos[o + 7] = ex[cc + 1]!;
          pos[o + 8] = ex[cc + 2]!;
          out.cellTri[t] = cell * 8 + k / 3;
          t++;
        }
      }
    }
  }
  out.tris = t;
  return t;
}
