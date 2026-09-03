import { expect, test } from 'vitest';
import { STREAK_COUNT, streakLayout, streakZ } from './streaks.ts';

test('streak layout is deterministic per seed and inside the tube', () => {
  const a = streakLayout(7);
  const b = streakLayout(7);
  expect(Array.from(a)).toEqual(Array.from(b));
  expect(Array.from(streakLayout(8))).not.toEqual(Array.from(a));
  for (let i = 0; i < STREAK_COUNT; i++) {
    const r = Math.hypot(a[i * 4]!, a[i * 4 + 1]!);
    expect(r).toBeGreaterThanOrEqual(6 - 1e-6);
    expect(r).toBeLessThanOrEqual(25 + 1e-6);
    expect(a[i * 4 + 2]).toBeGreaterThanOrEqual(-20);
    expect(a[i * 4 + 2]).toBeLessThan(60);
  }
});

test('streaks scroll toward the camera and wrap inside [-20, 60)', () => {
  expect(streakZ(10, 0)).toBe(10);
  expect(streakZ(10, 5)).toBe(5);
  expect(streakZ(-19, 5)).toBeCloseTo(56, 9);
  for (let t = 0; t < 1000; t += 7.3) {
    const z = streakZ(33, t);
    expect(z).toBeGreaterThanOrEqual(-20);
    expect(z).toBeLessThan(60);
  }
});
