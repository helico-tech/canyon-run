import { expect, test } from 'vitest';
import { FEATURE_CLAMP, featuresSD, gatherFeatures } from './features.ts';
import { baseDensity, density, FieldSampler, paramsAt } from './field.ts';
import { sfc32NextUnit, sfc32Seed } from '../sim/prng.ts';
import { CANYON, shellBound } from './params.ts';
import { spine } from './spine.ts';

const rng = sfc32Seed(2026);
const rand = (lo: number, hi: number): number => lo + (hi - lo) * sfc32NextUnit(rng);

test('the core tube is always air and the roof is always rock', () => {
  for (let i = 0; i < 2000; i++) {
    const seed = (sfc32NextUnit(rng) * 4294967296) >>> 0;
    const z = rand(-5000, 50000);
    const sp = spine(seed, z, CANYON);
    expect(density(seed, sp.cx, sp.coreY, z)).toBeLessThan(0);
    expect(density(seed, sp.cx, sp.ceilY + 20, z)).toBeGreaterThan(0);
    expect(density(seed, sp.cx, sp.floorY - 20, z)).toBeGreaterThan(0);
    expect(density(seed, sp.cx + sp.hw + 40, sp.coreY, z)).toBeGreaterThan(0);
  }
});

test('evaluation is a pure function of (seed, position): same bits from any gather box', () => {
  const seed = 7;
  const z = 300;
  const sp = spine(seed, z, CANYON);
  const chunk = new FieldSampler(seed);
  chunk.prepare(sp.cx - 200, sp.cx + 200, z - 100, z + 100);
  const tiny = new FieldSampler(seed);
  let checked = 0;
  for (let k = -12; k <= 12; k++) {
    for (let j = -20; j <= 20; j += 2) {
      for (let i = -24; i <= 24; i += 2) {
        const x = sp.cx + sp.hw + i;
        const y = sp.coreY + j * 2;
        const zz = z + k * 2;
        tiny.prepare(x, x, zz, zz);
        const a = chunk.density(x, y, zz);
        const b = tiny.density(x, y, zz);
        expect(Object.is(a, b)).toBe(true);
        expect(Number.isNaN(a)).toBe(false);
        checked++;
      }
    }
  }
  expect(checked).toBeGreaterThan(10000);
});

test('detail never lowers the field below base minus the shell bound', () => {
  const seed = 99;
  const bound = shellBound(CANYON);
  for (let i = 0; i < 3000; i++) {
    const z = rand(0, 4000);
    const sp = spine(seed, z, CANYON);
    const x = sp.cx + rand(-1.6, 1.6) * sp.hw;
    const y = sp.floorY + rand(-20, CANYON.height + 20);
    const full = density(seed, x, y, z);
    const base = baseDensity(CANYON, sp, x, y);
    expect(full).toBeGreaterThanOrEqual(base - bound - 1e-9);
  }
});

test('features are placed by hash and their distance is clamped', () => {
  const seed = 3;
  const feats = gatherFeatures(seed, CANYON, -400, 400, 0, 1024);
  expect(feats.length).toBeGreaterThan(20);
  const again = gatherFeatures(seed, CANYON, -400, 400, 0, 1024);
  expect(again).toEqual(feats);
  const kinds = new Set(feats.map((f) => f.kind));
  expect(kinds.size).toBe(3);
  expect(featuresSD(seed, 1e6, 0, 1e6, feats)).toBe(FEATURE_CLAMP);
  const pillar = feats.find((f) => f.kind === 0)!;
  expect(featuresSD(seed, pillar.x, 10, pillar.z, feats)).toBeLessThan(0);
});

test('paramsAt returns the canyon set for now', () => {
  expect(paramsAt(1, 12345)).toBe(CANYON);
});
