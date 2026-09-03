// Sky, fog and light colours per biome (research 05 §1.3). Render-side only.
import type { BiomePalette, Rgb } from '../terrain/palette.ts';

export interface Atmosphere {
  horizon: Rgb;
  zenith: Rgb;
  sun: Rgb;
  sunIntensity: number;
  hemiIntensity: number;
  /** Exp² fog density; 0.0038 is ~98 % fogged at 640 u, hiding the generation horizon. */
  fogDensity: number;
  /** Sun direction (unit): 35° elevation, 60° off the flight axis. */
  sunDir: readonly [number, number, number];
}

export function atmosphereFor(p: BiomePalette): Atmosphere {
  return {
    horizon: p.horizon,
    zenith: p.skyTop,
    sun: p.sun,
    sunIntensity: 2.2,
    hemiIntensity: 0.9,
    fogDensity: 0.0038,
    sunDir: [0.4965, 0.5736, 0.6516],
  };
}

export function rgbToFloat(c: Rgb): [number, number, number] {
  return [c[0] / 255, c[1] / 255, c[2] / 255];
}
