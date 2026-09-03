import { expect, test } from 'vitest';
import { KEY } from '../sim/input.ts';
import { InputSampler } from './inputSampler.ts';

test('keys are latched: a tap between ticks still counts once', () => {
  const s = new InputSampler();
  expect(s.keyDown('KeyW')).toBe(true);
  expect(s.keyUp('KeyW')).toBe(true);
  expect(s.take().keys).toBe(KEY.PITCH_DOWN);
  expect(s.take().keys).toBe(0);
});

test('held keys persist across ticks and unknown codes are ignored', () => {
  const s = new InputSampler();
  s.keyDown('ShiftLeft');
  s.keyDown('KeyD');
  expect(s.keyDown('KeyZ')).toBe(false);
  expect(s.take().keys).toBe(KEY.THR_UP | KEY.ROLL_R);
  expect(s.take().keys).toBe(KEY.THR_UP | KEY.ROLL_R);
  s.keyUp('KeyD');
  expect(s.take().keys).toBe(KEY.THR_UP);
});

test('mouse deltas accumulate, round to integers, clamp to int16 and reset', () => {
  const s = new InputSampler();
  s.mouseMove(1.4, -2.6);
  s.mouseMove(2.3, 0.2);
  s.mouseMove(0.4, 0.4); // sensor jitter below 1 px is ignored
  expect(s.take()).toEqual({ keys: 0, dx: 4, dy: -2 });
  expect(s.take()).toEqual({ keys: 0, dx: 0, dy: 0 });
  s.mouseMove(100000, -100000);
  expect(s.take()).toEqual({ keys: 0, dx: 32767, dy: -32768 });
});

test('disabled sampler ignores input and releaseAll clears held keys', () => {
  const s = new InputSampler();
  s.enabled = false;
  s.keyDown('KeyW');
  s.mouseMove(10, 10);
  expect(s.take()).toEqual({ keys: 0, dx: 0, dy: 0 });
  s.enabled = true;
  s.keyDown('KeyA');
  s.releaseAll();
  expect(s.take().keys).toBe(0);
});
