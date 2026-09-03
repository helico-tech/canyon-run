// One fixed tick of the flight model (spec §5.3). Pure: reads only state, input
// and constants; the only randomness is the sim's own PRNG.
import { segmentAt } from '../terrain/biomes.ts';
import { spineAt } from '../terrain/field.ts';
import { createSpine } from '../terrain/spine.ts';
import { CollisionScratch, distanceAt, hullHits, prepareTick, proximityOf } from './collision.ts';
import { C, speedFloor } from './constants.ts';
import type { InputFrame } from './input.ts';
import { KEY } from './input.ts';
import { sfc32Next, u32ToUnit } from './prng.ts';
import { basis, integrate } from './quat.ts';
import { clamp } from '../terrain/noise.ts';
import type { SimState } from './state.ts';

/** Speed-driven part of the score rate (SCORE_FLOOR at the reference minimum, 1 at MAX). */
export function scoreRate(s: SimState): number {
  const sf = clamp((s.speed - C.MIN_SPEED) / (C.MAX_SPEED - C.MIN_SPEED), 0, 1);
  return C.SCORE_FLOOR + (1 - C.SCORE_FLOOR) * sf * sf;
}

/** Proximity and streak multiplier on top of the rate. */
export function scoreFactor(s: SimState): number {
  const streak = s.streakTicks < C.STREAK_FULL ? s.streakTicks / C.STREAK_FULL : 1;
  return 1 + C.PROX_BONUS * s.proximity + C.STREAK_BONUS * streak;
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

  const sp = spineAt(s.seed, s.z, scratch.spine);
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

  const segBefore = segmentAt(s.z).index;
  const floor = speedFloor(segBefore);
  s.throttle = clamp(s.throttle + kThr * C.THROTTLE_PER_TICK, 0, 1);
  const target = floor + s.throttle * (C.MAX_SPEED - floor);
  s.speed += (target - s.speed) * C.SPEED_LERP;
  s.speed = clamp(
    s.speed - C.DIVE_GAIN * fwdY * C.DT,
    floor * 0.6,
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
  const ceilingNow = spineAt(s.seed, s.z, scratch.spine).ceilY - C.CEIL_MARGIN;
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
  const d = distanceAt(cs, s.x, s.y, s.z);
  s.proximity = proximityOf(d);
  const near = -d; // metres to rock, roughly
  const sf = clamp((s.speed - C.MIN_SPEED) / (C.MAX_SPEED - C.MIN_SPEED), 0, 1);

  // Proximity streak with a grace window.
  if (near < C.STREAK_RANGE) {
    s.streakTicks++;
    s.graceTicks = 0;
  } else if (s.streakTicks > 0) {
    s.graceTicks++;
    if (s.graceTicks > C.STREAK_GRACE) {
      s.streakTicks = 0;
      s.graceTicks = 0;
    }
  }
  s.score += Math.floor(C.SCORE_PER_TICK * scoreRate(s) * scoreFactor(s));

  // Near-miss events: CLOSE / SO CLOSE when a close pass ends, THREADED between two near walls.
  if (s.cooldown > 0) s.cooldown--;
  let eventId = 0;
  let eventPoints = 0;
  if (near < C.CLOSE_DIST) {
    if (s.closeTicks === 0 || near < s.closeMin) s.closeMin = near;
    s.closeTicks++;
  } else if (s.closeTicks > 0) {
    if (s.alive && s.closeTicks >= C.CLOSE_MIN_TICKS && sf > C.CLOSE_MIN_SF && s.cooldown === 0) {
      const soClose = s.closeMin < C.SO_CLOSE_DIST;
      eventId = soClose ? 2 : 1;
      eventPoints = soClose ? C.SO_CLOSE_BONUS : C.CLOSE_BONUS;
    }
    s.closeTicks = 0;
    s.closeMin = 0;
  }
  const rX = b[0]!;
  const rY = b[1]!;
  const rZ = b[2]!;
  const dl = distanceAt(
    cs,
    s.x + rX * C.THREAD_PROBE,
    s.y + rY * C.THREAD_PROBE,
    s.z + rZ * C.THREAD_PROBE,
  );
  const dr = distanceAt(
    cs,
    s.x - rX * C.THREAD_PROBE,
    s.y - rY * C.THREAD_PROBE,
    s.z - rZ * C.THREAD_PROBE,
  );
  if (-dl < C.THREAD_DIST && -dr < C.THREAD_DIST) {
    s.threadTicks++;
    if (s.alive && s.threadTicks === C.THREAD_TICKS && s.cooldown === 0 && eventId === 0) {
      eventId = 3;
      eventPoints = C.THREAD_BONUS;
    }
  } else s.threadTicks = 0;
  // Passing a biome gate (segment boundary) while alive pays a bonus.
  if (s.alive && segmentAt(s.z).index > segBefore) {
    eventId = 4;
    eventPoints = C.GATE_BONUS;
  }
  if (eventId !== 0) {
    s.score += eventPoints;
    s.eventId = eventId;
    s.eventTick = s.tick;
    s.eventPoints = eventPoints;
    if (eventId !== 4) s.cooldown = C.EVENT_COOLDOWN;
  }
  s.tick++;
}
