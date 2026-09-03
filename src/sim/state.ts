import { spineAt } from '../terrain/field.ts';
import { C } from './constants.ts';
import { hashF64sU32s } from './hash.ts';
import { sfc32Seed } from './prng.ts';

export interface SimState {
  tick: number;
  alive: 0 | 1;
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  /** u/s along body forward. */
  speed: number;
  /** [0, 1]. */
  throttle: number;
  /** rad/s, filtered command response (explicit state). */
  rollRate: number;
  pitchRate: number;
  yawRate: number;
  /** Integer milli-points. */
  score: number;
  /** [0, 1], 1 = touching rock. Diagnostic and score input. */
  proximity: number;
  seed: number;
  /** sfc32 state, advanced only by step(). */
  rng: Uint32Array;
}

export function createState(seed: number): SimState {
  const sp = spineAt(seed >>> 0, 0);
  return {
    tick: 0,
    alive: 1,
    x: sp.cx,
    y: sp.coreY,
    z: 0,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    speed: C.MIN_SPEED,
    throttle: C.START_THROTTLE,
    rollRate: 0,
    pitchRate: 0,
    yawRate: 0,
    score: 0,
    proximity: 0,
    seed: seed >>> 0,
    rng: sfc32Seed(seed >>> 0),
  };
}

export function cloneState(s: SimState): SimState {
  return { ...s, rng: Uint32Array.from(s.rng) };
}

export function copyState(dst: SimState, src: SimState): void {
  dst.tick = src.tick;
  dst.alive = src.alive;
  dst.x = src.x;
  dst.y = src.y;
  dst.z = src.z;
  dst.qx = src.qx;
  dst.qy = src.qy;
  dst.qz = src.qz;
  dst.qw = src.qw;
  dst.speed = src.speed;
  dst.throttle = src.throttle;
  dst.rollRate = src.rollRate;
  dst.pitchRate = src.pitchRate;
  dst.yawRate = src.yawRate;
  dst.score = src.score;
  dst.proximity = src.proximity;
  dst.seed = src.seed;
  dst.rng.set(src.rng);
}

/** FNV-1a 32 over the little-endian bits of the state vector, PRNG state and tick. */
export function checksum(s: SimState): number {
  return hashF64sU32s(
    [
      s.x,
      s.y,
      s.z,
      s.qx,
      s.qy,
      s.qz,
      s.qw,
      s.speed,
      s.throttle,
      s.rollRate,
      s.pitchRate,
      s.yawRate,
      s.score,
      s.proximity,
    ],
    [s.tick, s.alive, s.rng[0]!, s.rng[1]!, s.rng[2]!, s.rng[3]!],
  );
}
