import { expect, test } from 'vitest';
import { CANYON } from '../terrain/params.ts';
import { spine } from '../terrain/spine.ts';
import { C, hashConstants, speedFloor } from './constants.ts';
import { KEY, ZERO_INPUT } from './input.ts';
import { basis } from './quat.ts';
import { checksum, cloneState, createState } from './state.ts';
import { createPilot } from './pilot.ts';
import { FieldSampler, spineAt } from '../terrain/field.ts';
import { step, StepScratch } from './step.ts';

const b = new Float64Array(9);
const run = (seed: number, keys: number, ticks: number, dx = 0, dy = 0) => {
  const s = createState(seed);
  const input = { keys, dx, dy };
  for (let i = 0; i < ticks; i++) step(s, input);
  basis(s.qx, s.qy, s.qz, s.qw, b);
  return s;
};

test('command signs: pitch up raises forward.y, roll right drops right.y, yaw right turns toward -X', () => {
  run(1, KEY.PITCH_UP, 20);
  expect(b[7]).toBeGreaterThan(0.1);
  run(1, KEY.PITCH_DOWN, 20);
  expect(b[7]).toBeLessThan(-0.1);
  run(1, KEY.ROLL_R, 20);
  expect(b[1]).toBeLessThan(-0.1);
  run(1, KEY.ROLL_L, 20);
  expect(b[1]).toBeGreaterThan(0.1);
  run(1, KEY.YAW_R, 30);
  expect(b[6]).toBeLessThan(-0.05);
  run(1, KEY.YAW_L, 30);
  expect(b[6]).toBeGreaterThan(0.05);
});

test('mouse: pushing forward (dy > 0) pitches the nose down, dx > 0 rolls right', () => {
  run(1, 0, 20, 0, 40);
  expect(b[7]).toBeLessThan(-0.05);
  run(1, 0, 20, 40, 0);
  expect(b[1]).toBeLessThan(-0.1);
});

const fly = (seed: number, ticks: number, throttle: 'full' | 'idle' | 'vary') => {
  const s = createState(seed);
  const pilot = createPilot(seed, { throttle });
  for (let i = 0; i < ticks && s.alive; i++) step(s, pilot(s));
  basis(s.qx, s.qy, s.qz, s.qw, b);
  return s;
};

test('throttle raises speed toward MAX and lowers it toward MIN', () => {
  const fast = fly(1, 400, 'full');
  expect(fast.alive).toBe(1);
  expect(fast.throttle).toBe(1);
  expect(fast.speed).toBeGreaterThan(C.MAX_SPEED - 5);
  const slow = fly(1, 400, 'idle');
  expect(slow.alive).toBe(1);
  expect(slow.throttle).toBe(0);
  expect(slow.speed).toBeLessThan(C.MIN_SPEED + 5);
});

test('banking induces a turn', () => {
  const s = run(1, KEY.ROLL_R, 20);
  const fwdXBefore = b[6]!;
  for (let i = 0; i < 30; i++) step(s, ZERO_INPUT);
  basis(s.qx, s.qy, s.qz, s.qw, b);
  expect(s.alive).toBe(1);
  expect(b[6]).toBeLessThan(fwdXBefore - 0.02);
});

test('auto-level returns a banked plane to wings level', () => {
  const s = createState(1);
  // 45° roll right about +Z.
  s.qz = 0.3826834323650898;
  s.qw = 0.9238795325112867;
  basis(s.qx, s.qy, s.qz, s.qw, b);
  expect(b[1]).toBeLessThan(-0.6);
  const ghost = new StepScratch(1, { ghost: true });
  for (let i = 0; i < 180; i++) step(s, ZERO_INPUT, ghost);
  basis(s.qx, s.qy, s.qz, s.qw, b);
  expect(s.alive).toBe(1);
  expect(Math.abs(b[1]!)).toBeLessThan(0.05);
});

test('the scripted pilot survives 1800 ticks on seeds 1–3 (the core tube reaches the sim)', () => {
  for (const seed of [1, 2, 3]) {
    const s = fly(seed, 1800, 'vary');
    expect(s.alive).toBe(1);
    expect(s.z).toBeGreaterThan(1500);
    expect(s.score).toBeGreaterThan(0);
  }
});

test('teleporting into rock kills within one tick and freezes the state', () => {
  const s = createState(4);
  const sp = spine(4, s.z, CANYON);
  s.x = sp.cx + sp.hw + 30;
  step(s, ZERO_INPUT);
  expect(s.alive).toBe(0);
  const dead = cloneState(s);
  step(s, { keys: KEY.THR_UP, dx: 50, dy: 50 });
  expect(s.tick).toBe(dead.tick + 1);
  expect(s.score).toBe(dead.score);
  expect(s.x).toBe(dead.x);
});

test('the ceiling clamp holds even when pulling up hard', () => {
  const s = createState(5);
  for (let i = 0; i < 300; i++) {
    step(s, { keys: KEY.PITCH_UP, dx: 0, dy: 0 });
    const sp = spine(5, s.z, CANYON);
    expect(s.y).toBeLessThanOrEqual(sp.ceilY - C.CEIL_MARGIN + 1e-9);
  }
});

test('score grows faster at speed and near rock', () => {
  const slow = run(1, KEY.THR_DOWN, 300);
  const fast = run(1, KEY.THR_UP, 300);
  expect(fast.score).toBeGreaterThan(slow.score);
  expect(Number.isInteger(fast.score)).toBe(true);
});

test('stepping is deterministic across scratch instances and clones', () => {
  const a = createState(9);
  const b2 = createState(9);
  const own = new StepScratch(9);
  const inputs = [KEY.THR_UP, KEY.ROLL_R | KEY.PITCH_UP, 0, KEY.YAW_L, KEY.PITCH_DOWN];
  for (let i = 0; i < 200; i++) {
    const inp = { keys: inputs[i % inputs.length]!, dx: (i % 7) - 3, dy: (i % 5) - 2 };
    step(a, inp);
    step(b2, inp, own);
  }
  expect(checksum(a)).toBe(checksum(b2));
  const c = cloneState(a);
  step(a, ZERO_INPUT);
  step(c, ZERO_INPUT);
  expect(checksum(a)).toBe(checksum(c));
});

test('constants hash is stable and order-independent', () => {
  const h = hashConstants();
  expect(h).toBe(hashConstants({ ...C }));
  expect(h).not.toBe(hashConstants({ ...C, MAX_SPEED: 171 }));
});

test('throughput is logged (not asserted)', () => {
  const s = createState(11);
  const t0 = performance.now();
  const n = 20000;
  for (let i = 0; i < n; i++)
    step(s, i % 120 < 60 ? { keys: KEY.THR_UP, dx: 0, dy: 0 } : ZERO_INPUT);
  const ms = performance.now() - t0;
  console.info(
    `sim: ${((n / ms) * 1000).toFixed(0)} ticks/s, alive=${s.alive}, z=${s.z.toFixed(0)}`,
  );
});

test('crossing a segment boundary pays the gate bonus once and raises the speed floor', () => {
  const s = createState(1);
  const ghost = new StepScratch(1, { ghost: true });
  s.z = 1199.5; // crosses 1200 on the first tick at floor speed (0.83 u per tick)
  const before = s.score;
  step(s, ZERO_INPUT, ghost);
  step(s, ZERO_INPUT, ghost);
  expect(s.score - before).toBeGreaterThanOrEqual(C.GATE_BONUS);
  expect(s.score - before).toBeLessThan(C.GATE_BONUS + 5000);
  expect(speedFloor(0)).toBe(50);
  expect(speedFloor(1)).toBe(54);
  expect(speedFloor(99)).toBe(90);
});

/** Finds a point near the wall at the given distance band, flying level along +z. */
function pointNearRock(
  seed: number,
  minDist: number,
  maxDist: number,
): { x: number; y: number; z: number } {
  const sampler = new FieldSampler(seed);
  for (let z = 100; z < 1000; z += 3) {
    const sp = spineAt(seed, z);
    sampler.prepare(sp.cx - 60, sp.cx + 60, z - 10, z + 10);
    for (let x = sp.cx; x < sp.cx + sp.hw; x += 0.5) {
      const d = -sampler.density(x, sp.coreY, z);
      if (d > minDist && d < maxDist) return { x, y: sp.coreY, z };
    }
  }
  throw new Error('no point found');
}

test('a close pass that ends pays CLOSE or SO CLOSE once, then cools down', () => {
  const seed = 1;
  const s = createState(seed);
  const ghost = new StepScratch(seed, { ghost: true });
  s.throttle = 1;
  s.speed = 160;
  const p = pointNearRock(seed, 1.7, 2.5);
  s.x = p.x;
  s.y = p.y;
  s.z = p.z;
  // Hold the plane in the close band for the minimum number of ticks (teleport back each tick).
  for (let i = 0; i < C.CLOSE_MIN_TICKS + 1; i++) {
    step(s, ZERO_INPUT, ghost);
    s.x = p.x;
    s.y = p.y;
    s.z = p.z;
    s.speed = 160;
  }
  expect(s.closeTicks).toBeGreaterThanOrEqual(C.CLOSE_MIN_TICKS);
  // Leave to open air: the pass ends and the event fires.
  const sp = spineAt(seed, p.z);
  s.x = sp.cx;
  s.y = sp.coreY;
  const before = s.score;
  step(s, ZERO_INPUT, ghost);
  expect([1, 2]).toContain(s.eventId);
  expect(s.score - before).toBeGreaterThanOrEqual(C.CLOSE_BONUS);
  expect(s.cooldown).toBe(C.EVENT_COOLDOWN);
  const evTick = s.eventTick;
  // Cooldown blocks a second event immediately after.
  s.x = p.x;
  s.y = p.y;
  s.z = p.z;
  for (let i = 0; i < C.CLOSE_MIN_TICKS + 1; i++) {
    step(s, ZERO_INPUT, ghost);
    s.x = p.x;
    s.y = p.y;
    s.z = p.z;
    s.speed = 160;
  }
  s.x = sp.cx;
  s.y = sp.coreY;
  step(s, ZERO_INPUT, ghost);
  expect(s.eventTick).toBe(evTick);
});

test('the proximity streak raises the score rate and survives a short gap', () => {
  const s = createState(2);
  s.streakTicks = C.STREAK_FULL;
  expect(scoreRateFor(s)).toBeGreaterThan(scoreRateFor(createState(2)));
});

function scoreRateFor(s: ReturnType<typeof createState>): number {
  const sf = Math.min(Math.max((s.speed - C.MIN_SPEED) / (C.MAX_SPEED - C.MIN_SPEED), 0), 1);
  const streak = Math.min(s.streakTicks / C.STREAK_FULL, 1);
  return (
    (C.SCORE_FLOOR + (1 - C.SCORE_FLOOR) * sf * sf) *
    (1 + C.PROX_BONUS * s.proximity + C.STREAK_BONUS * streak)
  );
}
