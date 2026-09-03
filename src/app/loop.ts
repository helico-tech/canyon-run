// Fixed-timestep accumulator (ADR 0002 §3.2). The clock decides how many ticks
// run, never what a tick does.
import { C } from '../sim/constants.ts';

export const TICK_MS = 1000 / C.TICK_RATE;
export const MAX_TICKS_PER_FRAME = 5;
export const MAX_FRAME_MS = 250;

export interface Advance {
  ticks: number;
  acc: number;
  /** Interpolation factor for rendering, in [0, 1). */
  alpha: number;
}

/** Adds a frame's elapsed time and returns how many ticks to run and the leftover. */
export function advance(acc: number, elapsedMs: number): Advance {
  acc += Math.min(Math.max(elapsedMs, 0), MAX_FRAME_MS);
  let ticks = 0;
  while (acc >= TICK_MS && ticks < MAX_TICKS_PER_FRAME) {
    acc -= TICK_MS;
    ticks++;
  }
  if (ticks === MAX_TICKS_PER_FRAME) acc = 0; // drop the backlog; the sim does not care about wall time
  return { ticks, acc, alpha: acc / TICK_MS };
}
