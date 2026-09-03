// Turns DOM key and pointer events into per-tick InputFrames (ADR 0002 §3.3):
// keys are latched (a tap between ticks still counts), mouse deltas accumulate
// and are rounded to integers. Player settings (sensitivity, invert Y, the
// W/S throttle map) are applied here, before the sim sees integer counts.
import type { InputFrame } from '../sim/input.ts';
import { clampI16, KEY } from '../sim/input.ts';
import type { Settings } from './settings.ts';
import { DEFAULT_SETTINGS } from './settings.ts';

export const KEY_MAP: Readonly<Record<string, number>> = Object.freeze({
  KeyW: KEY.PITCH_DOWN,
  ArrowUp: KEY.PITCH_DOWN,
  KeyS: KEY.PITCH_UP,
  ArrowDown: KEY.PITCH_UP,
  KeyA: KEY.ROLL_L,
  ArrowLeft: KEY.ROLL_L,
  KeyD: KEY.ROLL_R,
  ArrowRight: KEY.ROLL_R,
  KeyQ: KEY.YAW_L,
  KeyE: KEY.YAW_R,
  ShiftLeft: KEY.THR_UP,
  ShiftRight: KEY.THR_UP,
  ControlLeft: KEY.THR_DOWN,
  ControlRight: KEY.THR_DOWN,
});

/** The W/S throttle map: W/S drive the throttle, Shift/Ctrl pitch. */
export const KEY_MAP_THROTTLE_WS: Readonly<Record<string, number>> = Object.freeze({
  ...KEY_MAP,
  KeyW: KEY.THR_UP,
  KeyS: KEY.THR_DOWN,
  ShiftLeft: KEY.PITCH_DOWN,
  ShiftRight: KEY.PITCH_DOWN,
  ControlLeft: KEY.PITCH_UP,
  ControlRight: KEY.PITCH_UP,
});

export class InputSampler {
  private readonly settings: Readonly<Settings>;
  constructor(settings: Readonly<Settings> = DEFAULT_SETTINGS) {
    this.settings = settings;
  }
  private keysDown = 0;
  private keysSeen = 0;
  private accX = 0;
  private accY = 0;
  /** Set to false to ignore keys (menus, replay playback). */
  enabled = true;

  private map(): Readonly<Record<string, number>> {
    return this.settings.throttleWS ? KEY_MAP_THROTTLE_WS : KEY_MAP;
  }

  /** Returns true when the code is a game key (callers preventDefault). */
  keyDown(code: string): boolean {
    const bit = this.map()[code];
    if (bit === undefined) return false;
    if (this.enabled) {
      this.keysDown |= bit;
      this.keysSeen |= bit;
    }
    return true;
  }

  keyUp(code: string): boolean {
    const bit = this.map()[code];
    if (bit === undefined) return false;
    this.keysDown &= ~bit;
    return true;
  }

  mouseMove(dx: number, dy: number): void {
    if (!this.enabled) return;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    const k = this.settings.sensitivity;
    this.accX += dx * k;
    this.accY += (this.settings.invertY ? -dy : dy) * k;
  }

  /** Drops held keys (window blur, pointer lock lost). */
  releaseAll(): void {
    this.keysDown = 0;
    this.keysSeen = 0;
    this.accX = 0;
    this.accY = 0;
  }

  take(): InputFrame {
    const keys = this.keysDown | this.keysSeen;
    this.keysSeen = 0;
    const dx = clampI16(Math.round(this.accX));
    const dy = clampI16(Math.round(this.accY));
    this.accX = 0;
    this.accY = 0;
    return { keys, dx, dy };
  }
}
