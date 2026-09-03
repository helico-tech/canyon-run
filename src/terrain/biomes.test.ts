import { afterEach, expect, test } from 'vitest';
import {
  atmosphereAt,
  BLEND_LENGTH,
  blendAt,
  CANYON_BIOME,
  mixParams,
  SEGMENT_HUB,
  SEGMENT_SPECIAL,
  segmentAt,
  SPECIALS,
} from './biomes.ts';
import type { BiomeDef } from './biomes.ts';
import { density, spineAt } from './field.ts';
import { CANYON } from './params.ts';
import { CANYON_PALETTE } from './palette.ts';

const TEST_SPECIAL: BiomeDef = {
  id: 99,
  name: 'test-tube',
  params: { ...CANYON, halfWidth: 28, height: 60, coreRadius: 10, pillarSpacing: 40, ridgeLen: 18 },
  palette: { ...CANYON_PALETTE, horizon: [10, 20, 30] },
  atmosphere: { fogDensity: 0.01, sunIntensity: 1, hemiIntensity: 0.5 },
};

afterEach(() => {
  SPECIALS.length = 0;
});

test('segments alternate hub (1200 u) and special (2400 u)', () => {
  expect(segmentAt(-50).index).toBe(0);
  expect(segmentAt(0)).toEqual({ index: 0, start: 0, end: SEGMENT_HUB });
  expect(segmentAt(SEGMENT_HUB)).toEqual({
    index: 1,
    start: SEGMENT_HUB,
    end: SEGMENT_HUB + SEGMENT_SPECIAL,
  });
  expect(segmentAt(SEGMENT_HUB + SEGMENT_SPECIAL + 5).index).toBe(2);
});

test('with no specials everything is canyon and blends are identity', () => {
  for (const z of [0, 1100, 1200, 1300, 3600, 9999]) {
    const b = blendAt(1, z);
    expect(b.a).toBe(CANYON_BIOME);
    expect(b.b).toBe(CANYON_BIOME);
    expect(b.t).toBe(0);
  }
});

test('mixParams(a, a, t) reproduces a bit for bit', () => {
  const out = { ...CANYON };
  mixParams(CANYON, CANYON, 0.37, out);
  for (const k of Object.keys(CANYON) as Array<keyof typeof CANYON>)
    expect(Object.is(out[k], CANYON[k])).toBe(true);
});

test('blend t rises smoothly across a boundary and specials are chosen by hash', () => {
  SPECIALS.push(TEST_SPECIAL);
  const before = blendAt(1, SEGMENT_HUB - BLEND_LENGTH);
  expect(before.a).toBe(CANYON_BIOME);
  expect(before.t).toBe(0);
  const mid = blendAt(1, SEGMENT_HUB);
  expect(mid.a).toBe(CANYON_BIOME);
  expect(mid.b).toBe(TEST_SPECIAL);
  expect(mid.t).toBeCloseTo(0.5, 6);
  const after = blendAt(1, SEGMENT_HUB + BLEND_LENGTH);
  expect(after.a).toBe(TEST_SPECIAL);
  expect(after.t).toBe(0);
  let last = -1;
  for (let z = SEGMENT_HUB - 200; z <= SEGMENT_HUB + 200; z += 4) {
    const b = blendAt(1, z);
    const t = b.a === CANYON_BIOME ? b.t : b.b === TEST_SPECIAL && b.a === TEST_SPECIAL ? 1 : b.t;
    expect(t).toBeGreaterThanOrEqual(last - 1e-12);
    last = t;
  }
  expect(mid.params.halfWidth).toBeCloseTo((40 + 28) / 2, 6);
});

test('the core stays air and the roof rock through a blend', () => {
  SPECIALS.push(TEST_SPECIAL);
  for (let z = SEGMENT_HUB - 300; z <= SEGMENT_HUB + SEGMENT_SPECIAL + 300; z += 37) {
    const sp = spineAt(2, z);
    expect(density(2, sp.cx, sp.coreY, z)).toBeLessThan(0);
    expect(density(2, sp.cx, sp.ceilY + 20, z)).toBeGreaterThan(0);
  }
});

test('atmosphere lerps palettes and fog', () => {
  SPECIALS.push(TEST_SPECIAL);
  const a = atmosphereAt(1, SEGMENT_HUB);
  expect(a.horizon[0]).toBeCloseTo((255 + 10) / 2, 6);
  expect(a.fogDensity).toBeCloseTo((0.0038 + 0.01) / 2, 6);
  expect(atmosphereAt(1, 0).fogDensity).toBe(0.0038);
});
