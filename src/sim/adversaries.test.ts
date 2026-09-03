import { afterEach, expect, test } from 'vitest';
import { SPECIALS, SEGMENT_HUB, segmentAt } from '../terrain/biomes.ts';
import type { BiomeDef } from '../terrain/biomes.ts';
import { spineAt } from '../terrain/field.ts';
import { ARENA_BIOME } from './arena.fixture.ts';
import {
  MOTION_CLOSE,
  MOTION_PULSE,
  MOTION_ERUPT,
  MOTION_AIM,
  aimFrom,
  createAim,
  ERUPT_MAX_STEP,
  SHAPE_RING,
  advPoseAt,
  circle,
  createPose,
  createStation,
  gatherStations,
  hullClearance,
  phase01,
  stationSD,
  swing,
  tri,
} from './adversaries.ts';
import type { Station } from './adversaries.ts';
import { C } from './constants.ts';
import { ZERO_INPUT } from './input.ts';
import { createState } from './state.ts';
import { step, StepScratch } from './step.ts';

const REGISTERED = SPECIALS.slice();
afterEach(() => {
  SPECIALS.length = 0;
  SPECIALS.push(...REGISTERED);
});

function arenaOnly(): void {
  SPECIALS.length = 0;
  SPECIALS.push(ARENA_BIOME);
}

const bits = (v: number): string => {
  const f = new Float64Array([v]);
  const u = new Uint32Array(f.buffer);
  return u[1]!.toString(16).padStart(8, '0') + u[0]!.toString(16).padStart(8, '0');
};

test('motion primitives: known answers and ranges', () => {
  expect(tri(0)).toBe(-1);
  expect(tri(0.25)).toBe(0);
  expect(tri(0.5)).toBe(1);
  expect(swing(0)).toBe(-1);
  expect(swing(0.5)).toBe(1);
  expect(swing(0.25)).toBe(0);
  expect(phase01(59, 60, 1)).toBe(0);
  expect(phase01(0, 60, 15)).toBe(0.25);
  const out = new Float64Array(2);
  circle(0, out, 0);
  expect(out[0]).toBe(1);
  expect(out[1]).toBe(0);
  circle(0.25, out, 0);
  expect(Math.abs(out[0]!)).toBeLessThan(1e-9);
  expect(out[1]).toBeCloseTo(1, 9);
  circle(0.1, out, 0);
  expect(Math.hypot(out[0]!, out[1]!)).toBeCloseTo(1, 12);
  expect(out[0]).toBeCloseTo(Math.cos(0.2 * Math.PI), 3); // 32-entry table: ~7e-5 error
  // Frozen bit patterns (cross-engine determinism like noise.test.ts).
  expect(bits(swing(0.137))).toBe(bits(swing(0.137)));
  expect(bits(swing(0.137))).toBe('bfe437ede0a14898');
});

test('no station before ADV_START, inside a blend, or in a biome without adversaries', () => {
  arenaOnly();
  const out = Array.from({ length: 64 }, createStation);
  const n = gatherStations(1, 0, 0, 12000, out);
  expect(n).toBeGreaterThan(10);
  for (let i = 0; i < n; i++) {
    const st = out[i]!;
    expect(st.z).toBeGreaterThanOrEqual(C.ADV_START);
    const toBoundary = Math.min(
      Math.abs(st.z - SEGMENT_HUB),
      Math.abs(st.z - 3600),
      Math.abs(st.z - 4800),
      Math.abs(st.z - 7200),
    );
    expect(toBoundary).toBeGreaterThan(160);
    expect(st.period).toBeGreaterThanOrEqual(1);
    expect(st.phase).toBeLessThan(st.period);
  }
  // A biome without an adversary set places nothing (forced for every segment).
  const QUIET: BiomeDef = { ...ARENA_BIOME, id: 91, name: 'quiet', adversaries: undefined };
  SPECIALS.length = 0;
  SPECIALS.push(QUIET);
  expect(gatherStations(1, QUIET.id, 0, 12000, out)).toBe(0);
});

test('a hull-sized free disc exists inside the core at every tick; segment 0 keeps the core clear; speed is capped', () => {
  arenaOnly();
  const out = Array.from({ length: 96 }, createStation);
  const pose = createPose();
  const prev = createPose();
  const HULL_R = C.ADV_HULL_R;
  let checked = 0;
  for (const seed of [1, 2, 3]) {
    const n = gatherStations(seed, 0, 0, 9000, out);
    for (let i = 0; i < n; i++) {
      const st = out[i]!;
      if (st.seg >= C.ADV_CORE_FROM) continue;
      const sp = spineAt(seed, st.z);
      for (let t = 0; t <= st.period; t += 1) {
        advPoseAt(st, t, st.z - 50, pose);
        // Candidate hull centres: the core centre and an ellipse of positions inside the core.
        let free = false;
        let clearCore = stationSD(st, pose, sp.cx, sp.coreY, st.z) > 0;
        if (hullClearance(st, pose, sp.cx, sp.coreY, st.z) >= 0) free = true;
        for (let k = 0; k < 12; k++) {
          const ang = (k / 12) * Math.PI * 2;
          const px = sp.cx + Math.cos(ang) * (st.core - HULL_R - 0.5);
          const py = sp.coreY + Math.sin(ang) * (st.core - C.ADV_HULL_RY - 0.5);
          if (hullClearance(st, pose, px, py, st.z) >= 0) free = true;
          const edgeX = sp.cx + Math.cos(ang) * (st.core - 0.5);
          const edgeY = sp.coreY + Math.sin(ang) * (st.core - 0.5);
          if (stationSD(st, pose, edgeX, edgeY, st.z) <= 0) clearCore = false;
        }
        expect(free, `${st.shape}/${st.motion} seed ${seed} z ${st.z} t ${t}: no free disc`).toBe(
          true,
        );
        if (st.seg === 0)
          expect(clearCore, `segment 0 station ${st.id} enters the core`).toBe(true);
        if (t > 0) {
          const step = Math.hypot(pose.x - prev.x, pose.y - prev.y);
          expect(step).toBeLessThanOrEqual(C.ADV_MAX_STEP + 1e-9);
        }
        prev.x = pose.x;
        prev.y = pose.y;
        checked++;
      }
    }
  }
  expect(checked).toBeGreaterThan(1000);
});

test('teleporting into a body kills; passing beside a hoop pays DODGED once', () => {
  arenaOnly();
  const out = Array.from({ length: 96 }, createStation);
  let seed = 1;
  let hoop: ReturnType<typeof createStation> | undefined;
  for (; seed <= 12 && !hoop; seed++) {
    const n = gatherStations(seed, 0, 0, 12000, out);
    const found = Array.from({ length: n }, (_, i) => out[i]!).find(
      (st) => st.shape === SHAPE_RING && st.motion !== MOTION_CLOSE,
    );
    if (found) hoop = { ...found };
  }
  seed--;
  expect(hoop).toBeDefined();
  const st = hoop!;
  // Kill: the plane's centre on the ring tube at the station's z.
  const s = createState(seed);
  const scratch = new StepScratch(seed);
  const pose = createPose();
  s.z = st.z - 2;
  s.speed = 120;
  s.throttle = 1;
  advPoseAt(st, s.tick + 1, s.z, pose);
  s.x = pose.x + st.len;
  s.y = pose.y;
  step(s, ZERO_INPUT, scratch);
  expect(s.alive).toBe(0);

  // Dodge: fly through the hole 5 u from the tube, crossing the station plane at speed.
  const d = createState(seed);
  const ds = new StepScratch(seed, { ghost: true });
  d.z = st.z - 2;
  d.gateSeg = segmentAt(d.z).index; // a teleport, not a crossing
  d.speed = 150;
  d.throttle = 1;
  advPoseAt(st, d.tick + 1, d.z, pose);
  d.x = pose.x + (st.len - st.r - 5);
  d.y = pose.y;
  const before = d.score;
  step(d, ZERO_INPUT, ds);
  expect(d.alive).toBe(1);
  expect(d.eventId).toBe(5);
  expect(d.score - before).toBeGreaterThanOrEqual(C.DODGE_BONUS);
  const evTick = d.eventTick;
  step(d, ZERO_INPUT, ds);
  expect(d.eventTick).toBe(evTick);
});

test('with every biome at prob 0 the tick cost and results are unchanged (no active stations)', () => {
  const s = createState(1);
  const scratch = new StepScratch(1);
  for (let i = 0; i < 300; i++) step(s, ZERO_INPUT, scratch);
  expect(scratch.adversaries.count).toBe(0);
});

test('an iris breathes between its closed and open radius and always leaves the centre clear', () => {
  arenaOnly();
  const out = Array.from({ length: 96 }, createStation);
  const pose = createPose();
  let checked = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const n = gatherStations(seed, 0, 0, 9000, out);
    for (let i = 0; i < n; i++) {
      const st = out[i]!;
      if (st.motion !== MOTION_PULSE) continue;
      const sp = spineAt(seed, st.z);
      let lo = Infinity;
      let hi = -Infinity;
      for (let t = 0; t < st.period; t++) {
        advPoseAt(st, t, st.z, pose);
        if (pose.radius < lo) lo = pose.radius;
        if (pose.radius > hi) hi = pose.radius;
        expect(hullClearance(st, pose, sp.cx, sp.coreY, st.z)).toBeGreaterThanOrEqual(0);
      }
      // Integer ticks may miss the exact extremes of the swing (odd periods), never exceed them.
      expect(lo).toBeGreaterThanOrEqual(st.len2 - 1e-9);
      expect(lo - st.len2).toBeLessThan(0.05);
      expect(hi).toBeLessThanOrEqual(st.len + 1e-9);
      expect(st.len - hi).toBeLessThan(0.05);
      if (st.seg < C.ADV_CORE_FROM) expect(st.len2 - st.r).toBeGreaterThanOrEqual(st.core + 2);
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(3);
});

test('a geyser rests in the floor, erupts below the lane at the top of the core, and rises slowly', () => {
  arenaOnly();
  const out = Array.from({ length: 96 }, createStation);
  const pose = createPose();
  let checked = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const n = gatherStations(seed, 0, 0, 9000, out);
    for (let i = 0; i < n; i++) {
      const st = out[i]!;
      if (st.motion !== MOTION_ERUPT) continue;
      const sp = spineAt(seed, st.z);
      expect(st.cy + st.r).toBeCloseTo(sp.floorY + 1, 6);
      const lane = 2 * C.ADV_HULL_RY + 3;
      const top = st.cy + st.ay + st.r;
      if (st.seg < C.ADV_CORE_FROM) expect(top).toBeLessThanOrEqual(sp.coreY - st.core - 2 + 1e-9);
      else expect(top).toBeLessThanOrEqual(sp.coreY + st.core - lane + 1e-9);
      let prevY = NaN;
      let maxStep = 0;
      let atRest = 0;
      for (let t = 0; t < st.period; t++) {
        advPoseAt(st, t, st.z, pose);
        if (pose.y === st.cy) atRest++;
        if (t > 0) maxStep = Math.max(maxStep, Math.abs(pose.y - prevY));
        prevY = pose.y;
      }
      expect(maxStep).toBeLessThanOrEqual(ERUPT_MAX_STEP + 1e-9);
      expect(atRest / st.period).toBeGreaterThan(0.6);
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(3);
});

test('an aimed body mirrors the plane, locks at closeDist on one tick, then holds', () => {
  arenaOnly();
  const out = Array.from({ length: 96 }, createStation);
  let seed = 1;
  let st: Station | undefined;
  for (; seed <= 12 && !st; seed++) {
    const n = gatherStations(seed, 0, 4800, 9000, out);
    for (let i = 0; i < n && !st; i++) if (out[i]!.motion === MOTION_AIM) st = { ...out[i]! };
  }
  seed--;
  expect(st).toBeDefined();
  const s = createState(seed);
  const scratch = new StepScratch(seed, { ghost: true });
  const sp = spineAt(seed, st!.z);
  s.z = st!.z - st!.closeDist - 40;
  s.x = sp.cx + 3;
  s.y = sp.coreY - 2;
  s.speed = 150;
  s.throttle = 1;
  const pose = createPose();
  const aim = createAim();
  // Before the lock the body mirrors the plane.
  advPoseAt(st!, s.tick, s.z, pose, aimFrom(s, aim));
  expect(pose.x).toBeCloseTo(s.x, 9);
  expect(pose.y).toBeCloseTo(s.y, 9);
  let lockTick = -1;
  for (let i = 0; i < 400 && s.z < st!.z; i++) {
    const before = s.advLockId;
    step(s, ZERO_INPUT, scratch);
    if (before === 0 && s.advLockId !== 0) {
      lockTick = s.tick;
      expect(s.advLockId).toBe(st!.id);
      expect(st!.z - s.z).toBeLessThanOrEqual(st!.closeDist);
      expect(s.advLockX).toBeCloseTo(s.x, 9);
      expect(s.advLockY).toBeCloseTo(s.y, 9);
    }
  }
  expect(lockTick).toBeGreaterThan(0);
  advPoseAt(st!, s.tick, s.z, pose, aimFrom(s, aim));
  expect(pose.x).toBe(s.advLockX);
  expect(pose.y).toBe(s.advLockY);
  // Passing the station keeps its lock through the collision band: no snap onto the plane.
  const lockX = s.advLockX;
  for (let i = 0; i < 400 && s.z < st!.z + C.ADV_NEAR_BAND; i++) step(s, ZERO_INPUT, scratch);
  expect(s.advLockId).toBe(st!.id);
  expect(s.advLockX).toBe(lockX);
});
