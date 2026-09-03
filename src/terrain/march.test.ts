import { expect, test } from 'vitest';
import { EDGE, MC_TABLES } from './mc-tables.ts';
import {
  CELLS,
  CELL_SIZE,
  CHUNK_SIZE,
  createMarchOutput,
  GRID_LENGTH,
  gridIndex,
  march,
  SAMPLES,
} from './march.ts';

test('edgeTable starts with the Bourke prefix and every case triangulates its face segments', () => {
  const { edgeTable, triTable, segsByCase, maxTris } = MC_TABLES;
  const known = [
    0x0, 0x109, 0x203, 0x30a, 0x406, 0x50f, 0x605, 0x70c, 0x80c, 0x905, 0xa0f, 0xb06, 0xc0a, 0xd03,
    0xe09, 0xf00,
  ];
  for (let i = 0; i < 16; i++) expect(edgeTable[i]).toBe(known[i]);
  expect(maxTris).toBe(5);
  let total = 0;
  for (let c = 0; c < 256; c++) {
    const used = new Set<number>();
    const directed = new Map<number, number>();
    for (let i = 0; i < 16 && triTable[c * 16 + i] !== -1; i += 3) {
      const t = [triTable[c * 16 + i]!, triTable[c * 16 + i + 1]!, triTable[c * 16 + i + 2]!];
      total++;
      for (const e of t) {
        expect((edgeTable[c]! >> e) & 1).toBe(1);
        used.add(e);
      }
      for (let k = 0; k < 3; k++) {
        const key = t[k]! * 16 + t[(k + 1) % 3]!;
        directed.set(key, (directed.get(key) ?? 0) + 1);
      }
    }
    for (let e = 0; e < 12; e++) if ((edgeTable[c]! >> e) & 1) expect(used.has(e)).toBe(true);
    const segKeys = new Set(segsByCase[c]!.map(([a, b]) => (a < b ? a * 16 + b : b * 16 + a)));
    const seen = new Set<number>();
    for (const [key, n] of directed) {
      expect(n).toBe(1);
      const a = key >> 4;
      const b = key & 15;
      const rev = b * 16 + a;
      const und = a < b ? key : rev;
      if (directed.has(rev)) continue; // interior fan diagonal, used twice in opposite directions
      expect(segKeys.has(und)).toBe(true);
      expect(seen.has(und)).toBe(false);
      seen.add(und);
    }
    expect(seen.size).toBe(segKeys.size);
  }
  expect(total).toBe(820);
});

test('case 1 (only corner 0 is air) winds toward the air corner', () => {
  const grid = new Float64Array(GRID_LENGTH).fill(1);
  grid[gridIndex(0, 0, 0)] = -1;
  const out = createMarchOutput();
  expect(march(grid, out)).toBe(1);
  const p = out.pos;
  const ux = p[3]! - p[0]!;
  const uy = p[4]! - p[1]!;
  const uz = p[5]! - p[2]!;
  const vx = p[6]! - p[0]!;
  const vy = p[7]! - p[1]!;
  const vz = p[8]! - p[2]!;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  // Toward corner 0 means the normal has negative components.
  expect(nx + ny + nz).toBeLessThan(0);
  // Vertices sit at the midpoints of edges 0, 8 and 3 (s = 0.5, cell 2 u).
  const xs = [p[0], p[3], p[6]].sort();
  expect(xs).toEqual([0, 0, 1]);
});

function randomGrid(seed: number): Float64Array {
  const grid = new Float64Array(GRID_LENGTH);
  let h = seed;
  for (let i = 0; i < grid.length; i++) {
    h = (Math.imul(h, 1103515245) + 12345) | 0;
    grid[i] = (h >>> 8) / 16777216 - 0.5;
  }
  return grid;
}

test('a random grid meshes to a closed surface (no open interior edges)', () => {
  const out = createMarchOutput(6 * CELLS * CELLS * CELLS);
  const tris = march(randomGrid(12345), out);
  expect(tris).toBeGreaterThan(50000);
  const edges = new Map<string, number>();
  const key = (i: number): string => `${out.pos[i]},${out.pos[i + 1]},${out.pos[i + 2]}`;
  for (let t = 0; t < tris; t++) {
    const o = t * 9;
    const k = [key(o), key(o + 3), key(o + 6)];
    for (let e = 0; e < 3; e++) {
      const d = k[e] + '|' + k[(e + 1) % 3];
      edges.set(d, (edges.get(d) ?? 0) + 1);
    }
  }
  let openInterior = 0;
  let tangent = 0;
  const onBoundary = (v: number[]): boolean => v.some((c) => c === 0 || c === CHUNK_SIZE);
  for (const [d, n] of edges) {
    // Fan triangulation of ambiguous faces can let two sheets touch along a line
    // (research 03 §4.2); a few such tangent edges are expected and harmless.
    if (n !== 1) tangent++;
    const [a, b] = d.split('|') as [string, string];
    if (edges.has(b + '|' + a)) continue;
    const pa = a.split(',').map(Number);
    const pb = b.split(',').map(Number);
    if (!(onBoundary(pa) && onBoundary(pb))) openInterior++;
  }
  expect(openInterior).toBe(0);
  expect(tangent).toBeLessThan(40);
});

test('two chunks sharing a face produce matching seam vertices', () => {
  // World field: a sphere centred on the shared plane x = CHUNK_SIZE.
  const field = (x: number, y: number, z: number): number => {
    const dx = x - CHUNK_SIZE;
    const dy = y - 30;
    const dz = z - 34;
    return 25 - Math.sqrt(dx * dx + dy * dy + dz * dz);
  };
  const fill = (ox: number): Float64Array => {
    const g = new Float64Array(GRID_LENGTH);
    for (let z = 0; z < SAMPLES; z++)
      for (let y = 0; y < SAMPLES; y++)
        for (let x = 0; x < SAMPLES; x++)
          g[gridIndex(x, y, z)] = field(ox + x * CELL_SIZE, y * CELL_SIZE, z * CELL_SIZE);
    return g;
  };
  const a = createMarchOutput();
  const b = createMarchOutput();
  march(fill(0), a);
  march(fill(CHUNK_SIZE), b);
  const seam = (
    out: { pos: Float32Array; tris: number },
    ox: number,
    localX: number,
  ): Set<string> => {
    const s = new Set<string>();
    for (let i = 0; i < out.tris * 9; i += 3) {
      if (out.pos[i] !== localX) continue;
      s.add(
        `${(ox + out.pos[i]!).toFixed(3)},${out.pos[i + 1]!.toFixed(3)},${out.pos[i + 2]!.toFixed(3)}`,
      );
    }
    return s;
  };
  const sa = seam(a, 0, CHUNK_SIZE);
  const sb = seam(b, CHUNK_SIZE, 0);
  expect(sa.size).toBeGreaterThan(20);
  expect(sa).toEqual(sb);
});

test('the triangle cap throws with a clear message', () => {
  const out = createMarchOutput(100);
  expect(() => march(randomGrid(1), out)).toThrow(/triangle cap 100 exceeded/);
});

test('edge table is consistent with EDGE endpoints', () => {
  expect(EDGE).toHaveLength(12);
  for (let c = 0; c < 256; c++) {
    let mask = 0;
    for (let e = 0; e < 12; e++) {
      const [p, q] = EDGE[e]!;
      if (((c >> p) & 1) !== ((c >> q) & 1)) mask |= 1 << e;
    }
    expect(MC_TABLES.edgeTable[c]).toBe(mask);
  }
});
