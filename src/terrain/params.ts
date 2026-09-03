// Field parameters. One field function, one parameter set per biome (ADR 0004).
// Amplitudes, lengths and radii are in world units; octave counts are integers.

export interface FieldParams {
  /** Corridor half width and floor-to-ceiling height. */
  halfWidth: number;
  height: number;
  /** Guaranteed-air tube radius and its height as a fraction of `height`. */
  coreRadius: number;
  coreYFrac: number;
  /** Spine wander: lateral (two terms) and floor altitude. */
  wanderAmp1: number;
  wanderLen1: number;
  wanderAmp2: number;
  wanderLen2: number;
  floorWanderAmp: number;
  floorWanderLen: number;
  widthVar: number;
  widthLen: number;
  /** Wall profile: walls lean out by `lip` then curl in by `overhang` near the ceiling. */
  profileLip: number;
  profileOverhang: number;
  /** Detail. */
  warpAmp: number;
  warpLen: number;
  warpOct: number;
  ridgeAmp: number;
  ridgeLen: number;
  ridgeYStretch: number;
  ridgeOct: number;
  floorNoiseAmp: number;
  floorNoiseLen: number;
  ceilNoiseAmp: number;
  ceilNoiseLen: number;
  heightOct: number;
  detailAmp: number;
  detailLen: number;
  smoothK: number;
  /** Features: hashed placement on cells. Probability 0 disables a feature. */
  pillarSpacing: number;
  pillarProb: number;
  pillarRadius: number;
  boulderSpacing: number;
  boulderProb: number;
  boulderRMin: number;
  boulderRMax: number;
  archSpacing: number;
  archProb: number;
  archRMin: number;
  archRMax: number;
}

export const CANYON: FieldParams = Object.freeze({
  halfWidth: 40,
  height: 110,
  coreRadius: 12,
  coreYFrac: 0.45,
  wanderAmp1: 80,
  wanderLen1: 800,
  wanderAmp2: 12,
  wanderLen2: 260,
  floorWanderAmp: 30,
  floorWanderLen: 520,
  widthVar: 0.35,
  widthLen: 230,
  profileLip: 0.3,
  profileOverhang: 0.6,
  warpAmp: 10,
  warpLen: 45,
  warpOct: 2,
  ridgeAmp: 7,
  ridgeLen: 28,
  ridgeYStretch: 0.35,
  ridgeOct: 3,
  floorNoiseAmp: 5,
  floorNoiseLen: 33,
  ceilNoiseAmp: 4,
  ceilNoiseLen: 25,
  heightOct: 2,
  detailAmp: 1.5,
  detailLen: 7,
  smoothK: 8,
  pillarSpacing: 56,
  pillarProb: 0.35,
  pillarRadius: 5,
  boulderSpacing: 20,
  boulderProb: 0.25,
  boulderRMin: 2,
  boulderRMax: 6,
  archSpacing: 256,
  archProb: 0.3,
  archRMin: 5,
  archRMax: 9,
});

/** Bound on |full − base| from detail terms; the shell skip relies on it (research 03 §2.7). */
export function shellBound(p: FieldParams): number {
  return (
    1.5 * p.warpAmp + p.ridgeAmp + p.floorNoiseAmp + p.ceilNoiseAmp + p.detailAmp + p.smoothK * 0.25
  );
}
