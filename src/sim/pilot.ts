// Scripted pilot: follows the corridor core. Deterministic from its own seed; it
// never touches the sim PRNG. Transcendental-free like the rest of src/sim.
//
// Controller: feed-forward the spine direction plus a gentle loop on the offset
// from the core gives a desired forward vector. The angular velocity that turns
// the current forward vector onto it is projected onto the body axes for the
// pitch and yaw commands, and the plane banks into the turn so pitch authority
// is available for turning.
import { spineAt } from '../terrain/field.ts';
import { createSpine } from '../terrain/spine.ts';
import { C } from './constants.ts';
import type { InputFrame } from './input.ts';
import { clampI16, KEY } from './input.ts';
import { sfc32Next, sfc32Seed, u32ToUnit } from './prng.ts';
import { basis } from './quat.ts';
import type { SimState } from './state.ts';

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
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
}

export function createPilot(seed: number, opts: PilotOptions = {}): (s: SimState) => InputFrame {
  const lookahead = opts.lookahead ?? 60;
  const mode = opts.throttle ?? 'vary';
  const jitter = opts.jitter ?? 4;
  const kLat = opts.kLat ?? 0.02;
  const kTurn = opts.kTurn ?? 5;
  const kBank = opts.kBank ?? 1.5;
  const rng = sfc32Seed((seed ^ 0xa5a5a5a5) >>> 0);
  const sp = createSpine();
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

    spineAt(s.seed, s.z - 20, sp);
    const cxBack = sp.cx;
    const cyBack = sp.coreY;
    spineAt(s.seed, s.z + lookahead, sp);
    const slopeX = (sp.cx - cxBack) / (lookahead + 20);
    const slopeY = (sp.coreY - cyBack) / (lookahead + 20);
    spineAt(s.seed, s.z, sp);
    const ex = sp.cx - s.x;
    const ey = sp.coreY - s.y;
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
