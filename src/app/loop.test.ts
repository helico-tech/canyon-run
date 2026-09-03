import { expect, test } from 'vitest';
import { advance, MAX_TICKS_PER_FRAME, TICK_MS } from './loop.ts';

test('one 60 Hz frame runs one tick and keeps the remainder', () => {
  const a = advance(0, TICK_MS * 1.25);
  expect(a.ticks).toBe(1);
  expect(a.acc).toBeCloseTo(TICK_MS * 0.25, 9);
  expect(a.alpha).toBeCloseTo(0.25, 9);
});

test('a slow frame runs several ticks, a stall is capped and the backlog dropped', () => {
  expect(advance(0, TICK_MS * 3.5).ticks).toBe(3);
  const stalled = advance(0, 5000);
  expect(stalled.ticks).toBe(MAX_TICKS_PER_FRAME);
  expect(stalled.acc).toBe(0);
});

test('negative or tiny elapsed time never runs a tick', () => {
  expect(advance(0, -5).ticks).toBe(0);
  expect(advance(0, 1).ticks).toBe(0);
});
