// Memory layout shared with wasm/field (ADR 0009). The Rust side hard-codes the
// same numbers; `layoutVersion` guards against the two drifting apart.
import type { FieldParams } from './params.ts';

export const LAYOUT_VERSION = 1;

/** The field parameters the hot path reads, in the order the wasm side indexes them. */
export const WASM_PARAM_KEYS = [
  'height',
  'coreRadius',
  'profileLip',
  'profileOverhang',
  'tubeness',
  'roofOpen',
  'stalactiteAmp',
  'stalagmiteAmp',
  'spikeLen',
  'warpAmp',
  'warpLen',
  'warpOct',
  'ridgeAmp',
  'ridgeLen',
  'ridgeYStretch',
  'ridgeOct',
  'floorNoiseAmp',
  'floorNoiseLen',
  'ceilNoiseAmp',
  'ceilNoiseLen',
  'heightOct',
  'detailAmp',
  'detailLen',
  'smoothK',
  'tunnelProb',
] as const satisfies ReadonlyArray<keyof FieldParams>;

export const PARAM_COUNT = WASM_PARAM_KEYS.length;
/** Parameter slots: scaled A, scaled B, blend mix (core), base A, base B. */
export const PARAM_SLOTS = 5;
export const SLOT_PA = 0;
export const SLOT_PB = 1;
export const SLOT_MIX = 2;
export const SLOT_BA = 3;
export const SLOT_BB = 4;
/** Spine slots (cx, floorY, ceilY, coreY, hw): A, B, mix. */
export const SPINE_FLOATS = 5;
export const SPINE_SLOTS = 3;
/** Feature record: kind, x, y, z, r, big, reach, dx, dy, dz, big2, tint. */
export const FEATURE_FLOATS = 12;
export const FEATURE_CAPACITY = 1024;
/** Row descriptor: t, bound, seed, countA, countB, aIsB (1 when both segments are one biome). */
export const ROW_FLOATS = 6;

export function packParams(p: FieldParams, out: Float64Array, offset: number): void {
  for (let i = 0; i < PARAM_COUNT; i++) out[offset + i] = p[WASM_PARAM_KEYS[i]!];
}
