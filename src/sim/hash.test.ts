import { expect, test } from 'vitest';
import { fnv1a32String, hashF64sU32s, hex32, utf8 } from './hash.ts';

test('FNV-1a 32 known answers', () => {
  expect(hex32(fnv1a32String(''))).toBe('811c9dc5');
  expect(hex32(fnv1a32String('a'))).toBe('e40c292c');
  expect(hex32(fnv1a32String('foobar'))).toBe('bf9cf968');
});

test('state hash distinguishes -0 from 0 and single-ulp changes', () => {
  const base = hashF64sU32s([1.5, 0], [7]);
  expect(hashF64sU32s([1.5, 0], [7])).toBe(base);
  expect(hashF64sU32s([1.5, -0], [7])).not.toBe(base);
  expect(hashF64sU32s([1.5 + Number.EPSILON, 0], [7])).not.toBe(base);
  expect(hashF64sU32s([1.5, 0], [8])).not.toBe(base);
});

test('utf8 matches TextEncoder for ASCII, BMP and astral characters', () => {
  for (const str of ['abc', 'é', '€', '😀', 'a€😀b']) {
    expect(Array.from(utf8(str))).toEqual(Array.from(new TextEncoder().encode(str)));
  }
});
