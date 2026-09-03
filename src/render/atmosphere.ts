// Sky, fog and light colours per biome (research 05 §1.3). Render-side only.
import { atmosphereAt } from '../terrain/biomes.ts';
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
  ambient: Rgb;
  ground: Rgb;
  accent?: Rgb;
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
    ambient: [171, 103.2, 86.4],
    ground: [140.25, 114.75, 76.5],
  };
}

export function rgbToFloat(c: Rgb): [number, number, number] {
  return [c[0] / 255, c[1] / 255, c[2] / 255];
}

export const SUN_DIR: readonly [number, number, number] = [0.4965, 0.5736, 0.6516];

/** Atmosphere blended between the biomes in force at z. */
export function atmosphereAtZ(seed: number, z: number): Atmosphere {
  const a = atmosphereAt(seed, z);
  return {
    horizon: a.horizon,
    zenith: a.zenith,
    sun: a.sun,
    sunIntensity: a.sunIntensity,
    hemiIntensity: a.hemiIntensity,
    fogDensity: a.fogDensity,
    sunDir: SUN_DIR,
    ambient: a.ambient,
    ground: a.ground,
    accent: a.accent,
  };
}
