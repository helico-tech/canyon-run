import { expect, test } from 'vitest';
import { formatSeed, hashForSeed, parseSeed, randomSeed, seedFromHash } from './seed.ts';

test('formats and parses XXXX-XXXX, plain hex and decimal', () => {
  expect(formatSeed(1)).toBe('0000-0001');
  expect(formatSeed(0xdeadbeef)).toBe('DEAD-BEEF');
  expect(parseSeed('DEAD-BEEF')).toBe(0xdeadbeef);
  expect(parseSeed('deadbeef')).toBe(0xdeadbeef);
  expect(parseSeed(' 42 ')).toBe(42);
  expect(parseSeed('4294967295')).toBe(0xffffffff);
  expect(parseSeed('4294967296')).toBeNull();
  expect(parseSeed('nope!')).toBeNull();
  expect(parseSeed('')).toBeNull();
});

test('round-trips through the URL hash', () => {
  expect(seedFromHash(hashForSeed(7))).toBe(7);
  expect(seedFromHash('#seed=0000-00FF&x=1')).toBe(255);
  expect(seedFromHash('#other')).toBeNull();
});

test('random seeds are non-zero u32', () => {
  expect(randomSeed(() => 0)).toBe(1);
  expect(randomSeed(() => 0.999999)).toBeLessThanOrEqual(0xffffffff);
});
