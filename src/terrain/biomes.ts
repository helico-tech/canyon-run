// Biome registry, sequencing along z, and parameter/palette blending (ADR 0004 §6).
// Even segments are the canyon hub; odd segments pick a special biome by hash.
import { hash1, lerp, smoothstep } from './noise.ts';
import type { BiomePalette, Rgb } from './palette.ts';
import { CANYON_PALETTE } from './palette.ts';
import type { FieldParams } from './params.ts';
import { CANYON } from './params.ts';

export interface BiomeAtmosphere {
  fogDensity: number;
  sunIntensity: number;
  hemiIntensity: number;
  /** Hemisphere light sky and ground colours (explicit: caves have dark skies but need light). */
  ambient: Rgb;
  ground: Rgb;
}

export interface BiomeDef {
  id: number;
  name: string;
  params: FieldParams;
  palette: BiomePalette;
  atmosphere: BiomeAtmosphere;
}

export const CANYON_BIOME: BiomeDef = Object.freeze<BiomeDef>({
  id: 0,
  name: 'canyon',
  params: CANYON,
  palette: CANYON_PALETTE,
  atmosphere: {
    fogDensity: 0.0038,
    sunIntensity: 2.2,
    hemiIntensity: 0.9,
    ambient: [171, 103.2, 86.4],
    ground: [140.25, 114.75, 76.5],
  },
});

/** Special biomes in delivery order (registered at the bottom of this file to avoid cycles). */
export const SPECIALS: BiomeDef[] = [];

export const SEGMENT_HUB = 1200;
export const SEGMENT_SPECIAL = 2400;
export const BLEND_LENGTH = 320;

/** Segment index and the z where it starts, for any z (negative z is segment 0). */
export function segmentAt(z: number): { index: number; start: number; end: number } {
  if (z < 0) return { index: 0, start: -Infinity, end: SEGMENT_HUB };
  const pair = SEGMENT_HUB + SEGMENT_SPECIAL;
  const k = Math.floor(z / pair);
  const rem = z - k * pair;
  if (rem < SEGMENT_HUB) return { index: 2 * k, start: k * pair, end: k * pair + SEGMENT_HUB };
  return { index: 2 * k + 1, start: k * pair + SEGMENT_HUB, end: (k + 1) * pair };
}

export function biomeForSegment(seed: number, index: number): BiomeDef {
  if (index % 2 === 0 || SPECIALS.length === 0) return CANYON_BIOME;
  return SPECIALS[hash1(index, seed ^ 0x42a5) % SPECIALS.length]!;
}

export interface Blend {
  a: BiomeDef;
  b: BiomeDef;
  /** 0 = pure a, 1 = pure b. */
  t: number;
  /** Mixed field params, valid when a !== b (else a.params). */
  params: FieldParams;
}

export function createBlend(): Blend {
  return { a: CANYON_BIOME, b: CANYON_BIOME, t: 0, params: { ...CANYON } };
}

/** Lerps every numeric field. Frequencies are lerped too, but the field never uses a mixed frequency: blends evaluate both fields (see field.ts). */
export function mixParams(
  a: FieldParams,
  b: FieldParams,
  t: number,
  out: FieldParams,
): FieldParams {
  const o = out as unknown as Record<string, number>;
  const pa = a as unknown as Record<string, number>;
  const pb = b as unknown as Record<string, number>;
  for (const k in pa) o[k] = lerp(pa[k]!, pb[k]!, t);
  return out;
}

/**
 * Biomes in force at z. Blend zones are BLEND_LENGTH wide, centred on segment
 * boundaries; t rises with z from the earlier biome to the later one.
 */
export function blendAt(seed: number, z: number, out: Blend = createBlend()): Blend {
  const seg = segmentAt(z);
  const here = biomeForSegment(seed, seg.index);
  const half = BLEND_LENGTH * 0.5;
  let other = here;
  let t = 0;
  if (z > seg.end - half && Number.isFinite(seg.end)) {
    other = biomeForSegment(seed, seg.index + 1);
    t = smoothstep(seg.end - half, seg.end + half, z);
  } else if (z < seg.start + half && Number.isFinite(seg.start) && seg.index > 0) {
    // Second half of the blend that started in the previous segment: a is the previous biome.
    const prev = biomeForSegment(seed, seg.index - 1);
    out.a = prev;
    out.b = here;
    out.t = smoothstep(seg.start - half, seg.start + half, z);
    if (prev === here) out.t = 0;
    else mixParams(prev.params, here.params, out.t, out.params);
    return out;
  }
  out.a = here;
  out.b = other;
  out.t = other === here ? 0 : t;
  if (other !== here) mixParams(here.params, other.params, out.t, out.params);
  return out;
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export function atmosphereAt(
  seed: number,
  z: number,
): { horizon: Rgb; zenith: Rgb; sun: Rgb; accent: Rgb } & BiomeAtmosphere {
  const bl = blendAt(seed, z);
  const pa = bl.a.palette;
  const pb = bl.b.palette;
  const aa = bl.a.atmosphere;
  const ab = bl.b.atmosphere;
  const t = bl.t;
  return {
    horizon: mixRgb(pa.horizon, pb.horizon, t),
    zenith: mixRgb(pa.skyTop, pb.skyTop, t),
    sun: mixRgb(pa.sun, pb.sun, t),
    accent: mixRgb(pa.accent, pb.accent, t),
    fogDensity: lerp(aa.fogDensity, ab.fogDensity, t),
    sunIntensity: lerp(aa.sunIntensity, ab.sunIntensity, t),
    hemiIntensity: lerp(aa.hemiIntensity, ab.hemiIntensity, t),
    ambient: mixRgb(aa.ambient, ab.ambient, t),
    ground: mixRgb(aa.ground, ab.ground, t),
  };
}

// Registration (biome files import only types from here, so this is not a cycle at runtime).
import { CAVE_BIOME } from './biomes/cave.ts';
import { SPIRES_BIOME } from './biomes/spires.ts';
import { LAVA_BIOME } from './biomes/lava.ts';
SPECIALS.push(CAVE_BIOME, SPIRES_BIOME, LAVA_BIOME);
