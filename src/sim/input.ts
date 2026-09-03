/** Per-tick input. Keys are latched bitflags; mouse deltas are integer counts. */
export interface InputFrame {
  keys: number;
  dx: number;
  dy: number;
}

export const KEY = Object.freeze({
  ROLL_L: 1,
  ROLL_R: 2,
  PITCH_UP: 4,
  PITCH_DOWN: 8,
  YAW_L: 16,
  YAW_R: 32,
  THR_UP: 64,
  THR_DOWN: 128,
});

/** Bits 8–15 are reserved and must stay zero so remapping never touches replays. */
export const KEY_MASK = 0xff;

export const ZERO_INPUT: Readonly<InputFrame> = Object.freeze({ keys: 0, dx: 0, dy: 0 });

export function clampI16(v: number): number {
  return v < -32768 ? -32768 : v > 32767 ? 32767 : v;
}
