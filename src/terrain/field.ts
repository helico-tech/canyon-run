// The terrain density field: d > 0 rock, d < 0 air (ADR 0004, spec §6).
import type { Feature } from './features.ts';
import { featuresSD, gatherFeatures } from './features.ts';
import { fbm2, fbm3, noise3, ridged3, smax, smoothstep } from './noise.ts';
import type { FieldParams } from './params.ts';
import { CANYON } from './params.ts';
import type { Spine } from './spine.ts';
import { createSpine, spine } from './spine.ts';

/** Parameter set in force at z. Canyon only until biomes land (CR-0016). */
export function paramsAt(_seed: number, _z: number): FieldParams {
  return CANYON;
}

function profile(p: FieldParams, h: number): number {
  return 1 + p.profileLip * smoothstep(0, 1, h) - p.profileOverhang * smoothstep(0.7, 1, h);
}

/** Cheap corridor-only field (~15 ns). Drives the shell skip and chunk pre-tests. */
export function baseDensity(p: FieldParams, sp: Spine, x: number, y: number): number {
  const h = (y - sp.floorY) / p.height;
  const sdWall = Math.abs(x - sp.cx) - sp.hw * profile(p, h);
  const sdFloor = sp.floorY - y;
  const sdCeil = y - sp.ceilY;
  return Math.max(sdWall, sdFloor, sdCeil);
}

export function coreDistance(p: FieldParams, sp: Spine, x: number, y: number): number {
  const dx = x - sp.cx;
  const dy = y - sp.coreY;
  return Math.sqrt(dx * dx + dy * dy) - p.coreRadius;
}

/** Full field given a precomputed spine and gathered features. */
export function fullDensity(
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
  const sdFloor = sp.floorY - py + p.floorNoiseAmp * fbm2(px * ff, z * ff, seed ^ 14, p.heightOct);
  const cf = 1 / p.ceilNoiseLen;
  const sdCeil = py - sp.ceilY + p.ceilNoiseAmp * fbm2(px * cf, z * cf, seed ^ 15, p.heightOct);
  let d = smax(smax(sdWall, sdFloor, p.smoothK), sdCeil, p.smoothK);
  const df = 1 / p.detailLen;
  d += p.detailAmp * noise3(x * df, y * df, z * df, seed ^ 16);
  d = Math.max(d, -featuresSD(seed, x, y, z, feats));
  return Math.min(d, coreDistance(p, sp, x, y));
}

/** Reusable evaluator for a region: gathers features once, then samples freely. */
export class FieldSampler {
  private readonly sp = createSpine();
  private feats: Feature[] = [];
  private p: FieldParams = CANYON;
  private spineZ = Number.NaN;

  constructor(private readonly seed: number) {}

  /** Prepares features for points inside the box; call before `density`. */
  prepare(x0: number, x1: number, z0: number, z1: number): void {
    this.p = paramsAt(this.seed, (z0 + z1) * 0.5);
    this.feats = gatherFeatures(this.seed, this.p, x0, x1, z0, z1, this.feats);
    this.spineZ = Number.NaN;
  }

  spineAt(z: number): Spine {
    if (z !== this.spineZ) {
      spine(this.seed, z, this.p, this.sp);
      this.spineZ = z;
    }
    return this.sp;
  }

  get params(): FieldParams {
    return this.p;
  }

  density(x: number, y: number, z: number): number {
    return fullDensity(this.seed, this.p, this.spineAt(z), this.feats, x, y, z);
  }
}

/** Standalone full evaluation at one point (gathers features around it). Convenience, not the hot path. */
export function density(seed: number, x: number, y: number, z: number): number {
  const s = new FieldSampler(seed);
  s.prepare(x, x, z, z);
  return s.density(x, y, z);
}
