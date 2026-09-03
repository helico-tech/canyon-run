// Per-face colour baked at chunk build time (spec §6.3). Only hash, noise, lerp
// and floor, so colour bytes are identical everywhere.
import { hash3, noise3, unit01 } from './noise.ts';
import type { BiomePalette } from './palette.ts';
import { rampLookup } from './palette.ts';
import type { FieldParams } from './params.ts';
import type { Spine } from './spine.ts';

export const MATERIAL_WALL = 0;
export const MATERIAL_FLOOR = 1;
export const MATERIAL_CEIL = 2;

const rgb = new Float64Array(3);

export function materialOf(ny: number): number {
  return ny > 0.6 ? MATERIAL_FLOOR : ny < -0.35 ? MATERIAL_CEIL : MATERIAL_WALL;
}

/**
 * Writes the rgba bytes of one face into `out` at `o`.
 * `faceKey` must be unique per face within the world (chunk key mixed with the cell/triangle id).
 */
export function faceColour(
  seed: number,
  p: FieldParams,
  pal: BiomePalette,
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
  if (material === MATERIAL_FLOOR) rampLookup(pal.floor, h, rgb);
  else if (material === MATERIAL_CEIL) rampLookup(pal.ceil, h, rgb);
  else {
    let band = h * pal.bands + 0.4 * noise3(x * 0.02, y * 0.02, z * 0.02, seed ^ 99);
    band -= Math.floor(band);
    rampLookup(pal.wall, band, rgb);
  }
  const j = 0.9 + 0.2 * unit01(hash3(faceKey, chunkKey, seed, 0x77));
  const r = rgb[0]! * j;
  const g = rgb[1]! * j;
  const b = rgb[2]! * j;
  out[o] = r > 255 ? 255 : r | 0;
  out[o + 1] = g > 255 ? 255 : g | 0;
  out[o + 2] = b > 255 ? 255 : b | 0;
  out[o + 3] = 255;
}
