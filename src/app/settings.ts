// Player settings (ADR 0008): transforms applied to raw input before the sim
// boundary. The sim, its constants and the replay format never see them.

export interface Settings {
  /** Mouse counts are scaled by this before rounding (0.5–2). */
  sensitivity: number;
  /** Flip the vertical mouse axis. */
  invertY: boolean;
  /** W/S drive the throttle and Shift/Ctrl pitch, instead of the reverse. */
  throttleWS: boolean;
}

export const SENSITIVITY_MIN = 0.5;
export const SENSITIVITY_MAX = 2;

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  sensitivity: 1,
  invertY: false,
  throttleWS: false,
});

export function isSettings(v: unknown): v is Settings {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.sensitivity === 'number' &&
    o.sensitivity >= SENSITIVITY_MIN &&
    o.sensitivity <= SENSITIVITY_MAX &&
    typeof o.invertY === 'boolean' &&
    typeof o.throttleWS === 'boolean'
  );
}
