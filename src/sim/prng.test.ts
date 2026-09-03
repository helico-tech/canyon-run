import { expect, test } from 'vitest';
import { sfc32Next, sfc32NextUnit, sfc32Seed, splitmix32 } from './prng.ts';

test('splitmix32 known answers (captured from research probe 03)', () => {
  const g = splitmix32(42);
  expect([g(), g(), g(), g()]).toEqual([551831576, 144025891, 322543647, 3034809370]);
});

test('sfc32 seeding and first draws are frozen', () => {
  const s = sfc32Seed(42);
  expect(Array.from(s)).toEqual([4033074370, 1052955323, 3091851518, 3034809382]);
  expect([sfc32Next(s), sfc32Next(s), sfc32Next(s), sfc32Next(s)]).toEqual([
    3825871779, 1851418855, 1383259262, 890322987,
  ]);
});

test('serialised state resumes identically', () => {
  const s = sfc32Seed(7);
  for (let i = 0; i < 100; i++) sfc32Next(s);
  const copy = Uint32Array.from(s);
  expect([sfc32Next(s), sfc32Next(s)]).toEqual([sfc32Next(copy), sfc32Next(copy)]);
});

test('unit draws are in [0, 1) and roughly uniform', () => {
  const s = sfc32Seed(3);
  const buckets = new Array<number>(16).fill(0);
  const n = 100000;
  for (let i = 0; i < n; i++) {
    const u = sfc32NextUnit(s);
    expect(u >= 0 && u < 1).toBe(true);
    buckets[(u * 16) | 0]!++;
  }
  for (const b of buckets) expect(Math.abs(b - n / 16)).toBeLessThan(n / 16 / 10);
});
