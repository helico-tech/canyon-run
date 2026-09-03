import { expect, test } from 'vitest';
import { SlabRing, SLABS_AHEAD } from './slabRing.ts';

test('first slab requests the whole window nearest-first, then the slab behind', () => {
  const ring = new SlabRing();
  const { request, evictBelow } = ring.setSlab(0);
  expect(request).toEqual([...Array.from({ length: SLABS_AHEAD + 1 }, (_, i) => i), -1]);
  expect(evictBelow).toBe(-1);
  expect(ring.idle).toBe(false);
  expect(ring.pending).toBe(12);
});

test('advancing requests only the new far slab and cancels/evicts behind', () => {
  const ring = new SlabRing();
  ring.setSlab(0);
  for (let cz = -1; cz <= 10; cz++) ring.markDone(cz);
  expect(ring.idle).toBe(true);
  const r = ring.setSlab(1);
  expect(r.request).toEqual([11]);
  expect(r.cancelBelow).toBe(0);
  expect(r.evictBelow).toBe(0);
  expect(ring.pending).toBe(1);
  ring.markDone(11);
  expect(ring.idle).toBe(true);
  expect(ring.residentSlabs).toBe(12);
});

test('a slab that was cancelled is re-requested if the plane comes back', () => {
  const ring = new SlabRing();
  ring.setSlab(5);
  ring.setSlab(7);
  const r = ring.setSlab(5);
  // 5 was cancelled when the plane moved to 7 (below 6), so it comes back first, then 4 behind.
  expect(r.request).toEqual([5, 4]);
  expect(r.cancelBelow).toBe(4);
});

test('repeated calls with the same slab request nothing', () => {
  const ring = new SlabRing();
  ring.setSlab(3);
  const r = ring.setSlab(3);
  expect(r.request).toEqual([]);
  expect(r.cancelBelow).toBeNull();
});
