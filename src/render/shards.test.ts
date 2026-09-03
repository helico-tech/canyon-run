import { expect, test } from 'vitest';
import { SHARD_COUNT, shardPosition, shardSpecs } from './shards.ts';

test('shard specs are deterministic per seed and spread around the plane velocity', () => {
  const a = shardSpecs(5, 0, 0, 100);
  const b = shardSpecs(5, 0, 0, 100);
  expect(a).toEqual(b);
  expect(shardSpecs(6, 0, 0, 100)).not.toEqual(a);
  expect(a).toHaveLength(SHARD_COUNT);
  for (const s of a) {
    const extra = Math.hypot(s.vx, s.vy, s.vz - 100);
    expect(extra).toBeGreaterThanOrEqual(10 - 1e-9);
    expect(extra).toBeLessThanOrEqual(40 + 1e-9);
    expect(s.size).toBeGreaterThan(0.29);
    expect(s.size).toBeLessThan(1.21);
  }
});

test('shards fall under gravity', () => {
  const s = shardSpecs(1, 0, 0, 0)[0]!;
  const [, y1] = shardPosition(s, 1);
  expect(y1).toBeCloseTo(s.vy - 10, 9);
  const [x0, y0, z0] = shardPosition(s, 0);
  expect(Math.abs(x0) + Math.abs(y0) + Math.abs(z0)).toBe(0);
});
