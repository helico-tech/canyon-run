// The terrain density field: d > 0 rock, d < 0 air (ADR 0004, spec §6).
// In a biome blend both fields are evaluated and lerped, then the mixed core
// tube is carved, so frequencies never slide and the corridor never closes.
import type { Blend } from './biomes.ts';
import { blendAt, createBlend } from './biomes.ts';
import type { Feature } from './features.ts';
import { featuresSD, gatherFeatures, tunnelsSD } from './features.ts';
import { fbm2, fbm3, lerp, noise3, ridged3, smax, smoothstep } from './noise.ts';
import type { FieldParams } from './params.ts';
import type { Spine } from './spine.ts';
import { createSpine, spine } from './spine.ts';

function profile(p: FieldParams, h: number): number {
  return 1 + p.profileLip * smoothstep(0, 1, h) - p.profileOverhang * smoothstep(0.7, 1, h);
}

/** Elliptic tube cross-section (caves): distance-like, negative inside. */
function tubeDistance(p: FieldParams, sp: Spine, x: number, y: number): number {
  const hh = p.height * 0.5;
  const ex = (x - sp.cx) / sp.hw;
  const ey = (y - (sp.floorY + hh)) / hh;
  const r = Math.sqrt(ex * ex + ey * ey);
  return (r - 1) * (sp.hw < hh ? sp.hw : hh);
}

/** Cheap corridor-only field (~15 ns). Drives the shell skip and chunk pre-tests. */
export function baseDensity(p: FieldParams, sp: Spine, x: number, y: number): number {
  const h = (y - sp.floorY) / p.height;
  const sdWall = Math.abs(x - sp.cx) - sp.hw * profile(p, h);
  const sdFloor = sp.floorY - y;
  const sdCeil = p.roofOpen > 0 ? -1e9 : y - sp.ceilY;
  const slot = Math.max(sdWall, sdFloor, sdCeil);
  return p.tubeness > 0 ? lerp(slot, tubeDistance(p, sp, x, y), p.tubeness) : slot;
}

export function coreDistance(p: FieldParams, sp: Spine, x: number, y: number): number {
  const dx = x - sp.cx;
  const dy = y - sp.coreY;
  return Math.sqrt(dx * dx + dy * dy) - p.coreRadius;
}

/** One biome's full field (without the core tube) given its spine and features. */
export function biomeDensity(
  seed: number,
  p: FieldParams,
  sp: Spine,
  feats: Feature[],
  x: number,
  y: number,
  z: number,
): number {
  const wf = 1 / p.warpLen;
  const px = x + p.warpAmp * fbm3(x * wf, y * wf, z * wf, seed ^ 11, p.warpOct);
  const py = y + p.warpAmp * fbm3(x * wf + 31.7, y * wf, z * wf + 17.1, seed ^ 12, p.warpOct);
  const h = (py - sp.floorY) / p.height;
  const rf = 1 / p.ridgeLen;
  const ridge =
    (ridged3(px * rf, py * rf * p.ridgeYStretch, z * rf, seed ^ 13, p.ridgeOct) - 0.5) *
    2 *
    p.ridgeAmp;
  const sdWall = Math.abs(px - sp.cx) - sp.hw * profile(p, h) + ridge;
  const ff = 1 / p.floorNoiseLen;
  let sdFloor = sp.floorY - py + p.floorNoiseAmp * fbm2(px * ff, z * ff, seed ^ 14, p.heightOct);
  const cf = 1 / p.ceilNoiseLen;
  let sdCeil =
    p.roofOpen > 0
      ? -1e9
      : py - sp.ceilY + p.ceilNoiseAmp * fbm2(px * cf, z * cf, seed ^ 15, p.heightOct);
  if (p.stalactiteAmp > 0 || p.stalagmiteAmp > 0) {
    // Sharp spikes: a ridged field cubed, sampled in the horizontal plane only.
    const sf = 1 / p.spikeLen;
    const r = ridged3(px * sf, 0, z * sf, seed ^ 17, 2);
    const spike = r * r * r;
    sdCeil += p.stalactiteAmp * spike;
    sdFloor += p.stalagmiteAmp * spike;
  }
  let d = smax(smax(sdWall, sdFloor, p.smoothK), sdCeil, p.smoothK);
  if (p.tubeness > 0) {
    const tube = tubeDistance(p, sp, px, py) + ridge * 0.5;
    d = lerp(d, smax(tube, sdFloor, p.smoothK), p.tubeness);
  }
  const df = 1 / p.detailLen;
  d += p.detailAmp * noise3(x * df, y * df, z * df, seed ^ 16);
  d = Math.max(d, -featuresSD(seed, x, y, z, feats));
  if (p.tunnelProb > 0) d = Math.min(d, tunnelsSD(x, y, z, feats));
  return d;
}

/** Full field with the guaranteed core tube, for a single biome. */
export function fullDensity(
  seed: number,
  p: FieldParams,
  sp: Spine,
  feats: Feature[],
  x: number,
  y: number,
  z: number,
): number {
  return Math.min(biomeDensity(seed, p, sp, feats, x, y, z), coreDistance(p, sp, x, y));
}

/** Spines and feature lists for a z: one biome, or two plus the mixed spine in a blend. */
export class FieldContext {
  readonly blend: Blend = createBlend();
  readonly spA = createSpine();
  readonly spB = createSpine();
  readonly spMix = createSpine();
  featsA: Feature[] = [];
  featsB: Feature[] = [];
  private seed: number;
  private z = Number.NaN;
  private x0 = 0;
  private x1 = 0;
  private z0 = 0;
  private z1 = 0;

  constructor(seed: number) {
    this.seed = seed >>> 0;
  }

  /** Sets the gather box; features are gathered lazily per biome pair. */
  setBox(x0: number, x1: number, z0: number, z1: number): void {
    this.x0 = x0;
    this.x1 = x1;
    this.z0 = z0;
    this.z1 = z1;
    this.z = Number.NaN;
    this.gatheredA = -1;
    this.gatheredB = -1;
  }

  private gatheredA = -1;
  private gatheredB = -1;

  /** Prepares blend and spines for z (cached while z is unchanged). */
  at(z: number): void {
    if (z === this.z) return;
    this.z = z;
    blendAt(this.seed, z, this.blend);
    const { segA, segB, t, pa, pb } = this.blend;
    spine(this.seed, z, pa, this.spA);
    // Feature sets depend on the segment's difficulty-scaled params: cache by segment index.
    if (segA !== this.gatheredA) {
      this.featsA = gatherFeatures(this.seed, pa, this.x0, this.x1, this.z0, this.z1, this.featsA);
      this.gatheredA = segA;
    }
    if (t > 0) {
      spine(this.seed, z, pb, this.spB);
      spine(this.seed, z, this.blend.params, this.spMix);
      if (segB !== this.gatheredB) {
        this.featsB = gatherFeatures(
          this.seed,
          pb,
          this.x0,
          this.x1,
          this.z0,
          this.z1,
          this.featsB,
        );
        this.gatheredB = segB;
      }
    }
  }

  /** Base density (cheap) for the mixed corridor at z. */
  base(x: number, y: number): number {
    const { a, b, t } = this.blend;
    if (a === b || t === 0) return baseDensity(a.params, this.spA, x, y);
    return lerp(baseDensity(a.params, this.spA, x, y), baseDensity(b.params, this.spB, x, y), t);
  }

  core(x: number, y: number): number {
    const { a, b, t } = this.blend;
    return a === b || t === 0
      ? coreDistance(a.params, this.spA, x, y)
      : coreDistance(this.blend.params, this.spMix, x, y);
  }

  /** Features-only rock (deep air branch of the shell skip). */
  featureRock(x: number, y: number, z: number): number {
    const { t } = this.blend;
    const fa = -featuresSD(this.seed, x, y, z, this.featsA);
    if (t === 0) return fa;
    return lerp(fa, -featuresSD(this.seed, x, y, z, this.featsB), t);
  }

  /** Full field at (x, y, z); call at(z) first. */
  density(x: number, y: number, z: number): number {
    const { t, pa, pb } = this.blend;
    if (t === 0) return fullDensity(this.seed, pa, this.spA, this.featsA, x, y, z);
    const da = biomeDensity(this.seed, pa, this.spA, this.featsA, x, y, z);
    const db = biomeDensity(this.seed, pb, this.spB, this.featsB, x, y, z);
    return Math.min(lerp(da, db, t), coreDistance(this.blend.params, this.spMix, x, y));
  }
}

/** Reusable evaluator for a region: gathers features once, then samples freely. */
export class FieldSampler {
  private readonly ctx: FieldContext;
  private readonly seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.ctx = new FieldContext(this.seed);
  }

  /** Prepares features for points inside the box; call before `density`. */
  prepare(x0: number, x1: number, z0: number, z1: number): void {
    this.ctx.setBox(x0, x1, z0, z1);
  }

  /** Mixed corridor spine at z (ceiling, floor, core). */
  spineAt(z: number): Spine {
    this.ctx.at(z);
    return this.ctx.blend.t === 0 ? this.ctx.spA : this.ctx.spMix;
  }

  density(x: number, y: number, z: number): number {
    this.ctx.at(z);
    return this.ctx.density(x, y, z);
  }
}

/** Mixed corridor spine at z for callers that only need the envelope (sim ceiling, pilot). */
const spineBlend = createBlend();
export function spineAt(seed: number, z: number, out: Spine = createSpine()): Spine {
  const bl = blendAt(seed, z, spineBlend);
  return spine(seed, z, bl.params, out);
}

/** Standalone full evaluation at one point (gathers features around it). Convenience, not the hot path. */
export function density(seed: number, x: number, y: number, z: number): number {
  const s = new FieldSampler(seed);
  s.prepare(x, x, z, z);
  return s.density(x, y, z);
}
