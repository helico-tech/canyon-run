// One fixed tick of the flight model (spec §5.3). Pure: reads only state, input
// and constants; the only randomness is the sim's own PRNG.
import { CANYON } from '../terrain/params.ts';
import { spine, createSpine } from '../terrain/spine.ts';
import { CollisionScratch, hullHits, prepareTick, proximityAt } from './collision.ts';
import { C } from './constants.ts';
import type { InputFrame } from './input.ts';
import { KEY } from './input.ts';
import { sfc32Next, u32ToUnit } from './prng.ts';
import { basis, integrate } from './quat.ts';
import type { SimState } from './state.ts';

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Reusable scratch for one seed; results never depend on it. */
export class StepScratch {
  readonly seed: number;
  /** Ghost mode skips hull collision (tests and camera fly-throughs); proximity still works. */
  ghost: boolean;
  readonly collision: CollisionScratch;
  readonly basis = new Float64Array(9);
  readonly quat = new Float64Array(4);
  readonly spine = createSpine();
  constructor(seed: number, opts: { ghost?: boolean } = {}) {
    this.seed = seed >>> 0;
    this.ghost = opts.ghost ?? false;
    this.collision = new CollisionScratch(this.seed);
  }
}

let shared: StepScratch | null = null;
export function scratchFor(seed: number): StepScratch {
  if (!shared || shared.seed !== seed >>> 0) shared = new StepScratch(seed);
  return shared;
}

export function step(
  s: SimState,
  input: InputFrame,
  scratch: StepScratch = scratchFor(s.seed),
): void {
  if (!s.alive) {
    s.tick++;
    return;
  }
  const k = input.keys;
  const kRoll = (k & KEY.ROLL_R ? 1 : 0) - (k & KEY.ROLL_L ? 1 : 0);
  const kPitch = (k & KEY.PITCH_UP ? 1 : 0) - (k & KEY.PITCH_DOWN ? 1 : 0);
  const kYaw = (k & KEY.YAW_R ? 1 : 0) - (k & KEY.YAW_L ? 1 : 0);
  const kThr = (k & KEY.THR_UP ? 1 : 0) - (k & KEY.THR_DOWN ? 1 : 0);

  const b = scratch.basis;
  basis(s.qx, s.qy, s.qz, s.qw, b);
  const rightY = b[1]!;
  const fwdY = b[7]!;

  let cmdRoll = clamp(kRoll + input.dx * C.MOUSE_ROLL_GAIN, -1, 1);
  let cmdPitch = clamp(kPitch - input.dy * C.MOUSE_PITCH_GAIN, -1, 1);
  let cmdYaw = clamp(kYaw, -1, 1);
  // Right wing low (right.y < 0) rolls back toward level and pulls the nose right.
  if (cmdRoll === 0) cmdRoll = clamp(rightY * C.AUTO_LEVEL, -1, 1);
  cmdYaw = clamp(cmdYaw - rightY * C.BANK_YAW_GAIN, -1, 1);

  const sp = spine(s.seed, s.z, CANYON, scratch.spine);
  const ceiling = sp.ceilY - C.CEIL_MARGIN;
  const softTop = ceiling - C.CEIL_SOFT;
  if (s.y > softTop)
    cmdPitch = clamp(cmdPitch - C.CEIL_PUSH * ((s.y - softTop) / C.CEIL_SOFT), -1, 1);

  // Turbulence draws from the sim PRNG so the stream stays part of the checksummed state.
  const gust = (u32ToUnit(sfc32Next(s.rng)) - 0.5) * C.TURBULENCE;
  s.rollRate += (cmdRoll * C.ROLL_RATE - s.rollRate) * C.RATE_LERP;
  s.pitchRate += (cmdPitch * C.PITCH_RATE + gust - s.pitchRate) * C.RATE_LERP;
  s.yawRate += (cmdYaw * C.YAW_RATE - s.yawRate) * C.RATE_LERP;

  // Body rates: nose up = -X, yaw right = -Y, roll right = +Z (spec §4).
  const half = 0.5 * C.DT;
  integrate(
    s.qx,
    s.qy,
    s.qz,
    s.qw,
    -s.pitchRate * half,
    -s.yawRate * half,
    s.rollRate * half,
    scratch.quat,
  );
  s.qx = scratch.quat[0]!;
  s.qy = scratch.quat[1]!;
  s.qz = scratch.quat[2]!;
  s.qw = scratch.quat[3]!;

  s.throttle = clamp(s.throttle + kThr * C.THROTTLE_PER_TICK, 0, 1);
  const target = C.MIN_SPEED + s.throttle * (C.MAX_SPEED - C.MIN_SPEED);
  s.speed += (target - s.speed) * C.SPEED_LERP;
  s.speed = clamp(
    s.speed - C.DIVE_GAIN * fwdY * C.DT,
    C.MIN_SPEED * 0.6,
    C.MAX_SPEED + C.OVERSPEED_MARGIN,
  );

  basis(s.qx, s.qy, s.qz, s.qw, b);
  const x0 = s.x;
  const y0 = s.y;
  const z0 = s.z;
  s.x += b[6]! * s.speed * C.DT;
  s.y += b[7]! * s.speed * C.DT;
  s.z += b[8]! * s.speed * C.DT;
  // Clamp against the roof at the new z so the invariant holds at every tick end.
  const ceilingNow = spine(s.seed, s.z, CANYON, scratch.spine).ceilY - C.CEIL_MARGIN;
  if (s.y > ceilingNow) s.y = ceilingNow;

  // Collision at the midpoint and the end of the tick's travel.
  const cs = scratch.collision;
  prepareTick(cs, x0, z0, s.x, s.z);
  const mx = (x0 + s.x) * 0.5;
  const my = (y0 + s.y) * 0.5;
  const mz = (z0 + s.z) * 0.5;
  if (
    !scratch.ghost &&
    (hullHits(cs, mx, my, mz, s.qx, s.qy, s.qz, s.qw) ||
      hullHits(cs, s.x, s.y, s.z, s.qx, s.qy, s.qz, s.qw))
  ) {
    s.alive = 0;
  }
  s.proximity = proximityAt(cs, s.x, s.y, s.z);

  const sf = clamp((s.speed - C.MIN_SPEED) / (C.MAX_SPEED - C.MIN_SPEED), 0, 1);
  const rate = C.SCORE_FLOOR + (1 - C.SCORE_FLOOR) * sf * sf;
  s.score += Math.floor(C.SCORE_PER_TICK * rate * (1 + C.PROX_BONUS * s.proximity));
  s.tick++;
}
