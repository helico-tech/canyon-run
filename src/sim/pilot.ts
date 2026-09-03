// Scripted pilot: follows the corridor core. Deterministic from its own seed; it
// never touches the sim PRNG. Transcendental-free like the rest of src/sim.
//
// Controller: feed-forward the spine direction plus a gentle loop on the offset
// from the core gives a desired forward vector. The angular velocity that turns
// the current forward vector onto it is projected onto the body axes for the
// pitch and yaw commands, and the plane banks into the turn so pitch authority
// is available for turning.
import { spineAt } from '../terrain/field.ts';
import {
  AdversaryScratch,
  MOTION_AIM,
  advPoseAt,
  aimFrom,
  createAim,
  createPose,
  hullClearance,
} from './adversaries.ts';
import { clamp, smoothstep } from '../terrain/noise.ts';
import { createSpine } from '../terrain/spine.ts';
import { C } from './constants.ts';
import type { InputFrame } from './input.ts';
import { clampI16, KEY } from './input.ts';
import { sfc32Next, sfc32Seed, u32ToUnit } from './prng.ts';
import { basis } from './quat.ts';
import type { SimState } from './state.ts';

function roundHalfUp(v: number): number {
  return Math.floor(v + 0.5);
}

export interface PilotOptions {
  /** Distance ahead along z used for the spine slope. */
  lookahead?: number;
  /** Throttle behaviour: 'vary' (random holds), 'full', 'idle'. */
  throttle?: 'vary' | 'full' | 'idle';
  /** Integer jitter added to the mouse counts (0 = none). */
  jitter?: number;
  /** Controller gains (tuning hooks). */
  kLat?: number;
  kTurn?: number;
  kBank?: number;
  /** Biome mode of the world being flown (must match the state). */
  mode?: number;
  /** Predictive lateral offset planner around adversary stations (default on). */
  dodge?: boolean;
}

/** Nine literal candidate offsets (unit): centre and eight directions. */
const CAND = new Float64Array([
  0, 0, 1, 0, 0.7071, 0.7071, 0, 1, -0.7071, 0.7071, -1, 0, -0.7071, -0.7071, 0, -1, 0.7071,
  -0.7071,
]);
const DODGE_HORIZON = 420;
const DODGE_SETTLE = 160;
const DODGE_WINDOW = 30;
const DODGE_WINDOW_STEP = 5;
const PERIOD_SAMPLES = 24;

export function createPilot(seed: number, opts: PilotOptions = {}): (s: SimState) => InputFrame {
  const lookahead = opts.lookahead ?? 60;
  const mode = opts.throttle ?? 'vary';
  const jitter = opts.jitter ?? 4;
  const kLat = opts.kLat ?? 0.02;
  const kTurn = opts.kTurn ?? 5;
  const kBank = opts.kBank ?? 1.5;
  const biomeMode = opts.mode ?? 0;
  const dodge = opts.dodge ?? true;
  const adv = new AdversaryScratch(seed, biomeMode);
  const advPose = createPose();
  const aim = createAim();
  const rng = sfc32Seed((seed ^ 0xa5a5a5a5) >>> 0);
  const sp = createSpine();
  const stationSpine = createSpine();
  const b = new Float64Array(9);
  let keys = mode === 'full' ? KEY.THR_UP : mode === 'idle' ? KEY.THR_DOWN : 0;
  let holdLeft = 0;
  return (s: SimState): InputFrame => {
    basis(s.qx, s.qy, s.qz, s.qw, b);
    const rX = b[0]!;
    const rY = b[1]!;
    const rZ = b[2]!;
    const uX = b[3]!;
    const uY = b[4]!;
    const uZ = b[5]!;
    const fX = b[6]!;
    const fY = b[7]!;
    const fZ = b[8]!;

    spineAt(s.seed, s.z - 20, sp, biomeMode);
    const cxBack = sp.cx;
    const cyBack = sp.coreY;
    spineAt(s.seed, s.z + lookahead, sp, biomeMode);
    const slopeX = (sp.cx - cxBack) / (lookahead + 20);
    const slopeY = (sp.coreY - cyBack) / (lookahead + 20);
    spineAt(s.seed, s.z, sp, biomeMode);
    let tx = sp.cx;
    let ty = sp.coreY;
    if (dodge) {
      // Pick the freest of nine offsets inside the core at the predicted arrival pose of the next station.
      adv.activate(s.z);
      let next = -1;
      let nextZ = s.z + DODGE_HORIZON;
      for (let i = 0; i < adv.count; i++) {
        const st = adv.stations[i]!;
        // An aimed body is nothing to dodge until it has locked.
        if (st.motion === MOTION_AIM && st.id !== s.advLockId) continue;
        if (st.z > s.z + 1 && st.z < nextZ) {
          nextZ = st.z;
          next = i;
        }
      }
      if (next >= 0) {
        const st = adv.stations[next]!;
        // Arrival is uncertain by a few dozen ticks (turning bleeds speed), so each
        // candidate is scored by its worst clearance across an arrival window.
        const eta = (st.z - s.z) / (s.speed * C.DT);
        const reachX = st.core - C.ADV_HULL_R - 2;
        const reachY = st.core - C.ADV_HULL_RY - 2;
        // Offsets are around the core at the station, not the body's own centre.
        spineAt(s.seed, st.z, stationSpine, biomeMode);
        const coreX = stationSpine.cx;
        const coreY = stationSpine.coreY;
        let best = -Infinity;
        let bx = 0;
        let by = 0;
        // Lanes free through the whole period win (they never flip on approach);
        // only when none exists is a candidate scored over the arrival window.
        for (let pass = 0; pass < 2 && best < 0; pass++) {
          for (let k = 0; k < 9; k++) {
            const ox = CAND[k * 2]! * reachX;
            const oy = CAND[k * 2 + 1]! * reachY;
            let worst = Infinity;
            if (pass === 0) {
              for (let m = 0; m < PERIOD_SAMPLES; m++) {
                advPoseAt(st, (m * st.period) / PERIOD_SAMPLES, st.z, advPose, aimFrom(s, aim));
                const sd = hullClearance(st, advPose, coreX + ox, coreY + oy, st.z);
                if (sd < worst) worst = sd;
              }
            } else {
              for (let dt = -DODGE_WINDOW; dt <= DODGE_WINDOW; dt += DODGE_WINDOW_STEP) {
                advPoseAt(st, s.tick + eta + dt, st.z, advPose, aimFrom(s, aim));
                const sd = hullClearance(st, advPose, coreX + ox, coreY + oy, st.z);
                if (sd < worst) worst = sd;
              }
            }
            const clear = worst - 0.05 * (Math.abs(ox) + Math.abs(oy));
            if (clear > best) {
              best = clear;
              bx = ox;
              by = oy;
            }
          }
        }
        const w = 1 - smoothstep(DODGE_SETTLE, DODGE_HORIZON, st.z - s.z);
        tx += bx * w;
        ty += by * w;
      }
    }
    const ex = tx - s.x;
    const ey = ty - s.y;
    let dX = slopeX + clamp(ex * kLat, -0.5, 0.5);
    let dY = slopeY + clamp(ey * kLat, -0.5, 0.5);
    let dZ = 1;
    const inv = 1 / Math.sqrt(dX * dX + dY * dY + dZ * dZ);
    dX *= inv;
    dY *= inv;
    dZ *= inv;

    // Desired world angular velocity: ω = kTurn · (fwd × (desired − fwd)).
    const eX = dX - fX;
    const eY = dY - fY;
    const eZ = dZ - fZ;
    let wX = (fY * eZ - fZ * eY) * kTurn;
    let wY = (fZ * eX - fX * eZ) * kTurn;
    let wZ = (fX * eY - fY * eX) * kTurn;
    const wLen = Math.sqrt(wX * wX + wY * wY + wZ * wZ);
    if (wLen > 2) {
      wX *= 2 / wLen;
      wY *= 2 / wLen;
      wZ *= 2 / wLen;
    }
    // Project onto body axes: +pitch is rotation about the right vector, +yaw-right is
    // rotation about -up (spec §4).
    const pitchRate = wX * rX + wY * rY + wZ * rZ;
    const yawRightRate = -(wX * uX + wY * uY + wZ * uZ);
    const cmdPitch = clamp(pitchRate / C.PITCH_RATE, -1, 1);
    const cmdYaw = yawRightRate / C.YAW_RATE;
    // Bank into the turn: a right turn wants right.y < 0.
    const desiredRightY = clamp(-yawRightRate * kBank, -0.85, 0.85);
    const rollErr = desiredRightY - rY;

    const jx = jitter ? (u32ToUnit(sfc32Next(rng)) - 0.5) * jitter : 0;
    const jy = jitter ? (u32ToUnit(sfc32Next(rng)) - 0.5) * jitter : 0;
    const dx = clampI16(clamp(roundHalfUp(-rollErr * 80 + jx), -300, 300));
    const dy = clampI16(clamp(roundHalfUp(-cmdPitch / C.MOUSE_PITCH_GAIN + jy), -300, 300));

    let k = keys;
    if (cmdYaw > 0.35) k |= KEY.YAW_R;
    else if (cmdYaw < -0.35) k |= KEY.YAW_L;
    if (mode === 'vary' && holdLeft-- <= 0) {
      holdLeft = 20 + (sfc32Next(rng) % 90);
      const r = u32ToUnit(sfc32Next(rng));
      keys = r < 0.55 ? KEY.THR_UP : r < 0.75 ? KEY.THR_DOWN : 0;
    }
    return { keys: k, dx, dy };
  };
}
