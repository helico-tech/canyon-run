// Per-face colour baked at chunk build time (spec §6.3). Only hash, noise, lerp
// and floor, so colour bytes are identical everywhere. In a biome blend both
// palettes are looked up and lerped.
import { hash3, lerp, noise3, unit01 } from './noise.ts';
import type { BiomePalette } from './palette.ts';
import { rampLookup } from './palette.ts';
import type { FieldParams } from './params.ts';
import type { Spine } from './spine.ts';

export const MATERIAL_WALL = 0;
export const MATERIAL_FLOOR = 1;
export const MATERIAL_CEIL = 2;

const rgbA = new Float64Array(3);
const rgbB = new Float64Array(3);

export function materialOf(ny: number): number {
  return ny > 0.6 ? MATERIAL_FLOOR : ny < -0.35 ? MATERIAL_CEIL : MATERIAL_WALL;
}

function lookup(
  pal: BiomePalette,
  material: number,
  h: number,
  bandNoise: number,
  out: Float64Array,
): void {
  if (material === MATERIAL_FLOOR) rampLookup(pal.floor, h, out);
  else if (material === MATERIAL_CEIL) rampLookup(pal.ceil, h, out);
  else {
    let band = h * pal.bands + bandNoise;
    band -= Math.floor(band);
    rampLookup(pal.wall, band, out);
  }
}

/**
 * Writes the rgba bytes of one face into `out` at `o`. `faceKey` must be unique
 * per face within the world (chunk key mixed with the cell/triangle id).
 */
export function faceColour(
  seed: number,
  p: FieldParams,
  palA: BiomePalette,
  palB: BiomePalette,
  t: number,
  sp: Spine,
  x: number,
  y: number,
  z: number,
  ny: number,
  faceKey: number,
  chunkKey: number,
  out: Uint8Array,
  o: number,
): void {
  const material = materialOf(ny);
  let h = (y - sp.floorY) / p.height;
  h = h < 0 ? 0 : h > 1 ? 1 : h;
  const bandNoise = 0.4 * noise3(x * 0.02, y * 0.02, z * 0.02, seed ^ 99);
  lookup(palA, material, h, bandNoise, rgbA);
  if (palA !== palB && t > 0) {
    lookup(palB, material, h, bandNoise, rgbB);
    rgbA[0] = lerp(rgbA[0]!, rgbB[0]!, t);
    rgbA[1] = lerp(rgbA[1]!, rgbB[1]!, t);
    rgbA[2] = lerp(rgbA[2]!, rgbB[2]!, t);
  }
  const j = 0.9 + 0.2 * unit01(hash3(faceKey, chunkKey, seed, 0x77));
  const r = rgbA[0]! * j;
  const g = rgbA[1]! * j;
  const b = rgbA[2]! * j;
  out[o] = r > 255 ? 255 : r | 0;
  out[o + 1] = g > 255 ? 255 : g | 0;
  out[o + 2] = b > 255 ? 255 : b | 0;
  out[o + 3] = 255;
}
