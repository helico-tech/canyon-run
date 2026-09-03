import { afterEach, expect, test } from 'vitest';
import {
  applyDifficulty,
  atmosphereAt,
  BLEND_LENGTH,
  blendAt,
  CANYON_BIOME,
  inClearZone,
  mixParams,
  SEGMENT_HUB,
  SEGMENT_SPECIAL,
  segmentAt,
  SPECIALS,
} from './biomes.ts';
import type { BiomeDef } from './biomes.ts';
import { density, spineAt } from './field.ts';
import { CANYON } from './params.ts';
import { FEATURE_FACTOR, WIDTH_FACTOR } from './difficulty.ts';
import { FEATURE_GATE, gatherFeatures } from './features.ts';
import { CANYON_PALETTE } from './palette.ts';

const TEST_SPECIAL: BiomeDef = {
  id: 99,
  name: 'test-tube',
  params: { ...CANYON, halfWidth: 28, height: 60, coreRadius: 10, pillarSpacing: 40, ridgeLen: 18 },
  palette: { ...CANYON_PALETTE, horizon: [10, 20, 30] },
  atmosphere: {
    fogDensity: 0.01,
    sunIntensity: 1,
    hemiIntensity: 0.5,
    ambient: [0, 0, 0],
    ground: [0, 0, 0],
  },
};

const REGISTERED = SPECIALS.slice();
afterEach(() => {
  SPECIALS.length = 0;
  SPECIALS.push(...REGISTERED);
});
function onlyTestSpecial(): void {
  SPECIALS.length = 0;
  SPECIALS.push(TEST_SPECIAL);
}

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

test('with no specials everything is canyon; blends only carry difficulty', () => {
  SPECIALS.length = 0;
  for (const z of [0, 1100, 1200, 1300, 3600, 9999]) {
    const b = blendAt(1, z);
    expect(b.a).toBe(CANYON_BIOME);
    expect(b.b).toBe(CANYON_BIOME);
  }
  expect(blendAt(1, 600).t).toBe(0);
  expect(blendAt(1, 1200).t).toBeCloseTo(0.5, 6);
});

test('mixParams(a, a, t) reproduces a bit for bit', () => {
  const out = { ...CANYON };
  mixParams(CANYON, CANYON, 0.37, out);
  for (const k of Object.keys(CANYON) as Array<keyof typeof CANYON>)
    expect(Object.is(out[k], CANYON[k])).toBe(true);
  // Difficulty tables are literals and scale the intended fields only.
  const hard = applyDifficulty(CANYON, 9, { ...CANYON });
  expect(hard.halfWidth).toBe(CANYON.halfWidth * WIDTH_FACTOR[9]!);
  expect(hard.pillarProb).toBeCloseTo(Math.min(0.95, CANYON.pillarProb * FEATURE_FACTOR[9]!), 12);
  expect(hard.coreRadius).toBe(CANYON.coreRadius);
  expect(applyDifficulty(CANYON, 99, { ...CANYON }).halfWidth).toBe(hard.halfWidth);
});

test('blend t rises smoothly across a boundary and specials are chosen by hash', () => {
  onlyTestSpecial();
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
    const t = b.a === TEST_SPECIAL ? 1 : b.t;
    expect(t).toBeGreaterThanOrEqual(last - 1e-12);
    last = t;
  }
  // Segment 0 keeps full width, segment 1 is scaled to 0.95 by the difficulty table.
  expect(mid.params.halfWidth).toBeCloseTo((40 * 1.0 + 28 * 0.95) / 2, 6);
});

test('the core stays air and the roof rock through a blend', () => {
  onlyTestSpecial();
  for (let z = SEGMENT_HUB - 300; z <= SEGMENT_HUB + SEGMENT_SPECIAL + 300; z += 37) {
    const sp = spineAt(2, z);
    expect(density(2, sp.cx, sp.coreY, z)).toBeLessThan(0);
    expect(density(2, sp.cx, sp.ceilY + 20, z)).toBeGreaterThan(0);
  }
});

test('atmosphere lerps palettes and fog', () => {
  onlyTestSpecial();
  const a = atmosphereAt(1, SEGMENT_HUB);
  expect(a.horizon[0]).toBeCloseTo((255 + 10) / 2, 6);
  expect(a.fogDensity).toBeCloseTo((0.0038 + 0.01) / 2, 6);
  expect(atmosphereAt(1, 0).fogDensity).toBe(0.0038);
});

test('every registered special keeps the core air and the roof rock across its segment and blends', () => {
  expect(REGISTERED.length).toBeGreaterThan(0);
  for (const special of REGISTERED) {
    SPECIALS.length = 0;
    SPECIALS.push(special);
    for (const seed of [1, 2]) {
      for (let z = SEGMENT_HUB - 300; z <= SEGMENT_HUB + SEGMENT_SPECIAL + 300; z += 41) {
        const sp = spineAt(seed, z);
        expect(density(seed, sp.cx, sp.coreY, z), `${special.name} core at z=${z}`).toBeLessThan(0);
        if (special.params.roofOpen === 0) {
          expect(density(seed, sp.cx, sp.ceilY + 24, z), `${special.name} roof`).toBeGreaterThan(0);
        }
      }
    }
  }
});

test('the clear zone around a boundary has no features except the gate', () => {
  expect(inClearZone(SEGMENT_HUB - 10)).toBe(true);
  expect(inClearZone(SEGMENT_HUB - 200)).toBe(false);
  const bl = blendAt(1, SEGMENT_HUB);
  const feats = gatherFeatures(1, bl.pa, -400, 400, SEGMENT_HUB - 60, SEGMENT_HUB + 60);
  const gates = feats.filter((f) => f.kind === FEATURE_GATE);
  expect(gates).toHaveLength(1);
  expect(gates[0]!.z).toBe(SEGMENT_HUB);
  for (const f of feats)
    if (f.kind !== FEATURE_GATE) expect(Math.abs(f.z - SEGMENT_HUB)).toBeGreaterThanOrEqual(75);
});
