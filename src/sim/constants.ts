// Every tunable of the simulation. All time coefficients are per tick (60 Hz)
// literals: nothing here is derived with exp() at load time (ADR 0002). Changing
// any value changes constantsHash and therefore invalidates old replays.
import { fnv1a32String } from './hash.ts';

export const C = Object.freeze({
  TICK_RATE: 60,
  DT: 1 / 60,
  // speed (u/s). MIN_SPEED is the scoring reference; the enforced floor rises per segment.
  MIN_SPEED: 50,
  MAX_SPEED: 170,
  SPEED_FLOOR: [50, 54, 58, 62, 66, 70, 74, 78, 82, 86, 90],
  OVERSPEED_MARGIN: 30,
  THROTTLE_PER_TICK: 1 / 90,
  SPEED_LERP: 0.03,
  DIVE_GAIN: 20,
  // rotation (rad/s at full command)
  ROLL_RATE: 3.5,
  PITCH_RATE: 1.75,
  YAW_RATE: 0.7,
  RATE_LERP: 0.2,
  MOUSE_ROLL_GAIN: 0.02,
  MOUSE_PITCH_GAIN: 0.02,
  BANK_YAW_GAIN: 0.6,
  AUTO_LEVEL: 0.35,
  // envelope
  CEIL_MARGIN: 16,
  CEIL_SOFT: 20,
  CEIL_PUSH: 2,
  TURBULENCE: 0,
  HULL_TOLERANCE: 0.4,
  PROXIMITY_RANGE: 25,
  // scoring (integer milli-points per tick)
  SCORE_PER_TICK: 1000,
  SCORE_FLOOR: 0.2,
  PROX_BONUS: 1.0,
  GATE_BONUS: 1500000,
  // near-miss events (distances in u, times in ticks, points in milli-points)
  CLOSE_DIST: 3,
  SO_CLOSE_DIST: 1.5,
  CLOSE_MIN_TICKS: 5,
  CLOSE_MIN_SF: 0.5,
  THREAD_DIST: 6,
  THREAD_PROBE: 8,
  THREAD_TICKS: 3,
  EVENT_COOLDOWN: 36,
  STREAK_RANGE: 10,
  STREAK_GRACE: 45,
  STREAK_FULL: 120,
  STREAK_BONUS: 0.5,
  CLOSE_BONUS: 250000,
  SO_CLOSE_BONUS: 750000,
  THREAD_BONUS: 500000,
  // adversaries (ADR 0007)
  ADV_START: 600,
  ADV_CLAMP: 40,
  ADV_MAX_STEP: 1.5,
  ADV_WINDOW: 700,
  ADV_NEAR_BAND: 37,
  ADV_CORE_FROM: 4,
  HULL_CORE_R: 2,
  ADV_HULL_R: 4.5,
  /** Vertical half-extent of the level hull (core sphere + tolerance) for planning and audits. */
  ADV_HULL_RY: 2.5,
  DODGE_BONUS: 400000,
  DODGE_DIST: 6,
  // start
  START_THROTTLE: 0.5,
});

export type Constants = typeof C;

/** FNV-1a over the canonical JSON of the sorted constant entries. */
export function hashConstants(c: Record<string, number | readonly number[]> = C): number {
  const keys = Object.keys(c).sort();
  return fnv1a32String(JSON.stringify(keys.map((k) => [k, c[k]])));
}

/** Enforced minimum speed for a segment index (last table entry beyond the table). */
export function speedFloor(segment: number): number {
  const t = C.SPEED_FLOOR;
  const i = segment < 0 ? 0 : segment >= t.length ? t.length - 1 : segment;
  return t[i]!;
}
