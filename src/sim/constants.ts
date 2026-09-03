// Every tunable of the simulation. All time coefficients are per tick (60 Hz)
// literals: nothing here is derived with exp() at load time (ADR 0002). Changing
// any value changes constantsHash and therefore invalidates old replays.
import { fnv1a32String } from './hash.ts';

export const C = Object.freeze({
  TICK_RATE: 60,
  DT: 1 / 60,
  // speed (u/s)
  MIN_SPEED: 50,
  MAX_SPEED: 170,
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
  // start
  START_THROTTLE: 0.5,
});

export type Constants = typeof C;

/** FNV-1a over the canonical JSON of the sorted constant entries. */
export function hashConstants(c: Record<string, number> = C): number {
  const keys = Object.keys(c).sort();
  return fnv1a32String(JSON.stringify(keys.map((k) => [k, c[k]])));
}
