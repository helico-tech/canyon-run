import { expect, test } from 'vitest';
import { biomeForSegment, SPECIALS } from './biomes.ts';
import { buildChunk, createChunkScratch, fillGrid, slabCandidates } from './chunk.ts';
import { CHUNK_SIZE, MAX_TRIS_PER_CHUNK } from './march.ts';
import { CANYON } from './params.ts';
import { spine } from './spine.ts';

const scratch = createChunkScratch();

function wallChunk(seed: number, z: number): [number, number, number] {
  const sp = spine(seed, z, CANYON);
  return [
    Math.floor((sp.cx + sp.hw) / CHUNK_SIZE),
    Math.floor(sp.coreY / CHUNK_SIZE),
    Math.floor(z / CHUNK_SIZE),
  ];
}

test('a chunk far inside rock has no surface and costs only the base pass', () => {
  const mesh = buildChunk(1, 40, 0, 4, scratch);
  expect(mesh).toBeNull();
  expect(scratch.full).toBe(0);
});

test('a wall chunk has surface, and building it twice gives identical bytes', () => {
  const [cx, cy, cz] = wallChunk(1, 256);
  const a = buildChunk(1, cx, cy, cz, scratch)!;
  expect(a.tris).toBeGreaterThan(200);
  expect(a.tris).toBeLessThanOrEqual(MAX_TRIS_PER_CHUNK);
  expect(scratch.full).toBeGreaterThan(0);
  expect(scratch.baseOnly).toBeGreaterThan(0);
  buildChunk(1, cx + 3, cy - 1, cz + 2, scratch);
  const b = buildChunk(1, cx, cy, cz, createChunkScratch())!;
  expect(Buffer.from(b.pos.buffer).equals(Buffer.from(a.pos.buffer))).toBe(true);
  expect(Buffer.from(b.rgba.buffer).equals(Buffer.from(a.rgba.buffer))).toBe(true);
});

test('colours vary across faces and every alpha is 255', () => {
  const [cx, cy, cz] = wallChunk(2, 512);
  const m = buildChunk(2, cx, cy, cz, scratch)!;
  const colours = new Set<number>();
  for (let t = 0; t < m.tris; t++) {
    const o = t * 12;
    colours.add((m.rgba[o]! << 16) | (m.rgba[o + 1]! << 8) | m.rgba[o + 2]!);
    expect(m.rgba[o + 3]).toBe(255);
    for (let v = 1; v < 3; v++)
      for (let c = 0; c < 4; c++) expect(m.rgba[o + v * 4 + c]).toBe(m.rgba[o + c]);
  }
  expect(colours.size).toBeGreaterThan(50);
});

test('neighbouring chunks share seam vertices in world space', () => {
  const seed = 3;
  const [cx, cy, cz] = wallChunk(seed, 128);
  const a = buildChunk(seed, cx, cy, cz, scratch)!;
  const b = buildChunk(seed, cx, cy, cz + 1, createChunkScratch())!;
  const seam = (
    m: { pos: Float32Array; tris: number; cz: number },
    localZ: number,
  ): Set<string> => {
    const s = new Set<string>();
    for (let i = 0; i < m.tris * 9; i += 3) {
      if (m.pos[i + 2] !== localZ) continue;
      s.add(
        `${m.pos[i]!.toFixed(3)},${m.pos[i + 1]!.toFixed(3)},${(m.cz * CHUNK_SIZE + m.pos[i + 2]!).toFixed(3)}`,
      );
    }
    return s;
  };
  const sa = seam(a, CHUNK_SIZE);
  const sb = seam(b, 0);
  expect(sa.size).toBeGreaterThan(10);
  expect(sa).toEqual(sb);
});

test('a ten-slab census stays inside the triangle budget', () => {
  const seed = 1;
  let total = 0;
  let nonEmpty = 0;
  let candidates = 0;
  for (let cz = 0; cz < 10; cz++) {
    let slab = 0;
    for (const [cx, cy] of slabCandidates(seed, cz)) {
      candidates++;
      const m = buildChunk(seed, cx, cy, cz, scratch);
      if (!m) continue;
      nonEmpty++;
      slab += m.tris;
      expect(m.tris).toBeLessThanOrEqual(MAX_TRIS_PER_CHUNK);
    }
    expect(slab).toBeGreaterThan(3000);
    total += slab;
  }
  console.info(
    `census seed ${seed}: ${candidates} candidates, ${nonEmpty} non-empty, ${total} tris over 10 slabs`,
  );
  expect(total).toBeLessThan(400000);
});

test('fillGrid marks the guaranteed core as air at the chunk containing the spine', () => {
  const seed = 5;
  const z = 320;
  const sp = spine(seed, z, CANYON);
  const cx = Math.floor(sp.cx / CHUNK_SIZE);
  const cy = Math.floor(sp.coreY / CHUNK_SIZE);
  const cz = Math.floor(z / CHUNK_SIZE);
  fillGrid(seed, cx, cy, cz, scratch);
  let air = 0;
  for (const v of scratch.grid) if (v < 0) air++;
  expect(air).toBeGreaterThan(1000);
});

test('every special biome stays inside the triangle budget', { timeout: 120000 }, () => {
  for (const special of SPECIALS) {
    let seed = 1;
    while (biomeForSegment(seed, 1) !== special) seed++;
    let total = 0;
    let maxTris = 0;
    for (let cz = 30; cz < 34; cz++) {
      for (const [cx, cy] of slabCandidates(seed, cz)) {
        const m = buildChunk(seed, cx, cy, cz, scratch);
        if (!m) continue;
        total += m.tris;
        maxTris = Math.max(maxTris, m.tris);
        expect(m.tris, `${special.name} chunk ${cx},${cy},${cz}`).toBeLessThanOrEqual(
          MAX_TRIS_PER_CHUNK,
        );
      }
    }
    console.info(
      `${special.name} (seed ${seed}): ${total} tris over 4 slabs, max ${maxTris} per chunk`,
    );
    expect(total).toBeGreaterThan(5000);
  }
});

test('a special-biome slab stays inside the triangle budget (seed 1)', () => {
  const seed = 1;
  let total = 0;
  for (let cz = 30; cz < 34; cz++) {
    for (const [cx, cy] of slabCandidates(seed, cz)) {
      const m = buildChunk(seed, cx, cy, cz, scratch);
      if (!m) continue;
      total += m.tris;
      expect(m.tris).toBeLessThanOrEqual(MAX_TRIS_PER_CHUNK);
    }
  }
  expect(total).toBeGreaterThan(5000);
});
