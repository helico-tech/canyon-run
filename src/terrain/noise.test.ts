import { expect, test } from 'vitest';
import {
  fbm3,
  hash1,
  noise3,
  ridged3,
  smax,
  smin,
  smoothstep,
  unit01,
  vnoise1,
  vnoise2,
} from './noise.ts';

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);
const bits = (v: number): string => {
  f64[0] = v;
  return u32[1]!.toString(16).padStart(8, '0') + u32[0]!.toString(16).padStart(8, '0');
};
const SEED = 0x1234abcd | 0;

test('noise3 known-answer bit patterns (research 03, verified in V8, CPython, Rust, wasm)', () => {
  expect(bits(noise3(0.1, 0.2, 0.3, SEED))).toBe('3fd128592dfb07ac');
  expect(bits(noise3(-3.7, 12.25, 99.9, SEED))).toBe('3fd9b716a2bc7f42');
  expect(bits(noise3(1000.5, -0.001, 7, SEED))).toBe('bf4062532c873a00');
  expect(bits(noise3(17.3, 42.1, -8.6, SEED))).toBe('bfd6d25a968fed77');
});

test('20 000-sample cross-language checksum of fbm3 + ridged3 + vnoise1', () => {
  let cx = 0;
  let cy = 0;
  let sum = 0;
  for (let i = 0; i < 20000; i++) {
    const x = i * 0.137 - 100;
    const y = i * 0.071 + 3;
    const z = -i * 0.053;
    f64[0] =
      fbm3(x * 0.05, y * 0.05, z * 0.05, SEED, 4, 2, 0.5) +
      ridged3(x * 0.1, y * 0.1, z * 0.1, SEED ^ 77, 3, 2, 0.5) +
      vnoise1(z * 0.01, SEED);
    cx ^= u32[0]!;
    cy ^= u32[1]!;
    sum += f64[0];
  }
  const xor = (cy >>> 0).toString(16).padStart(8, '0') + (cx >>> 0).toString(16).padStart(8, '0');
  expect(xor).toBe('fe04e98a8fd708c1');
  expect(sum).toBe(11897.05833454898);
});

test('noise3 is continuous across lattice boundaries and zero at lattice points', () => {
  expect(noise3(3, 4, 5, SEED)).toBe(0);
  const a = noise3(2.999999, 4.5, 5.5, SEED);
  const b = noise3(3.000001, 4.5, 5.5, SEED);
  expect(Math.abs(a - b)).toBeLessThan(1e-4);
});

test('value noise stays within [-1, 1] and unit01 within [0, 1)', () => {
  for (let i = 0; i < 2000; i++) {
    const v1 = vnoise1(i * 0.37, SEED);
    const v2 = vnoise2(i * 0.37, i * 0.11, SEED);
    expect(v1).toBeGreaterThanOrEqual(-1);
    expect(v1).toBeLessThanOrEqual(1);
    expect(v2).toBeGreaterThanOrEqual(-1);
    expect(v2).toBeLessThanOrEqual(1);
    const u = unit01(hash1(i, SEED));
    expect(u).toBeGreaterThanOrEqual(0);
    expect(u).toBeLessThan(1);
  }
});

test('ridged3 is within [0, 1]', () => {
  for (let i = 0; i < 2000; i++) {
    const r = ridged3(i * 0.13, i * 0.07, -i * 0.05, SEED, 3);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(1);
  }
});

test('smin/smax equal min/max far apart and round the crease nearby', () => {
  expect(smin(1, 10, 2)).toBe(1);
  expect(smax(1, 10, 2)).toBe(10);
  expect(smin(1, 1.5, 2)).toBeLessThan(1);
  expect(smax(1, 1.5, 2)).toBeGreaterThan(1.5);
  expect(smoothstep(0, 1, -1)).toBe(0);
  expect(smoothstep(0, 1, 2)).toBe(1);
  expect(smoothstep(0, 1, 0.5)).toBe(0.5);
});
