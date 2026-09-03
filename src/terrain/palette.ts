// Biome palettes (research 05 §1.5 and 03 §7). sRGB u8 stops; ramps are lerped.

export type Rgb = readonly [number, number, number];

export interface BiomePalette {
  wall: readonly Rgb[];
  floor: readonly Rgb[];
  ceil: readonly Rgb[];
  /** Horizon and fog colour; the terrain dissolves into it. */
  horizon: Rgb;
  skyTop: Rgb;
  sun: Rgb;
  accent: Rgb;
  /** Strata bands per unit of normalised height. */
  bands: number;
  /** Crystal face colours by tint index (biomes with crystals). */
  crystals?: readonly Rgb[];
}

export const CANYON_PALETTE: BiomePalette = Object.freeze<BiomePalette>({
  wall: [
    [196, 84, 52],
    [228, 132, 64],
    [242, 178, 92],
    [160, 60, 70],
  ],
  floor: [
    [214, 176, 96],
    [232, 202, 120],
  ],
  ceil: [
    [92, 40, 60],
    [140, 60, 80],
  ],
  horizon: [255, 154, 92],
  skyTop: [45, 27, 78],
  sun: [255, 233, 168],
  accent: [46, 230, 214],
  bands: 7,
});

/** Linear lookup into a ramp at t ∈ [0, 1]; writes r, g, b into out[0..2]. */
export function rampLookup(ramp: readonly Rgb[], t: number, out: Float64Array): void {
  const n = ramp.length - 1;
  const f = t * n;
  let i = Math.floor(f);
  if (i >= n) i = n - 1;
  if (i < 0) i = 0;
  const u = f - i;
  const a = ramp[i]!;
  const b = ramp[i + 1]!;
  out[0] = a[0] + (b[0] - a[0]) * u;
  out[1] = a[1] + (b[1] - a[1]) * u;
  out[2] = a[2] + (b[2] - a[2]) * u;
}
