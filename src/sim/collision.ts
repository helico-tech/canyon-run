// Collision and proximity from the terrain field (ADR 0004 §5). Nothing here
// reads mesh data; the field is the only truth.
import { FieldSampler } from '../terrain/field.ts';
import { C } from './constants.ts';
import { rotate } from './quat.ts';

/** Hull probe offsets in body units: nose, tail, right wing, left wing, top, bottom. */
export const HULL_PROBES: readonly number[] = [
  0, 0, 3, 0, 0, -2, -4, 0, 0, 4, 0, 0, 0, 1, 0, 0, -1, 0,
];
export const HULL_REACH = 8;

export class CollisionScratch {
  readonly sampler: FieldSampler;
  readonly probe = new Float64Array(3);
  constructor(seed: number) {
    this.sampler = new FieldSampler(seed);
  }
}

/** Prepares the field for every probe of a tick moving from (x0,z0) to (x1,z1). */
export function prepareTick(
  cs: CollisionScratch,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): void {
  const r = HULL_REACH + 1;
  cs.sampler.prepare(
    Math.min(x0, x1) - r,
    Math.max(x0, x1) + r,
    Math.min(z0, z1) - r,
    Math.max(z0, z1) + r,
  );
}

/** True when any hull probe is inside rock (within tolerance) at the given pose. */
export function hullHits(
  cs: CollisionScratch,
  x: number,
  y: number,
  z: number,
  qx: number,
  qy: number,
  qz: number,
  qw: number,
): boolean {
  const p = cs.probe;
  for (let i = 0; i < HULL_PROBES.length; i += 3) {
    rotate(qx, qy, qz, qw, HULL_PROBES[i]!, HULL_PROBES[i + 1]!, HULL_PROBES[i + 2]!, p, 0);
    if (cs.sampler.density(x + p[0]!, y + p[1]!, z + p[2]!) > -C.HULL_TOLERANCE) return true;
  }
  return false;
}

/** Signed field value at a point (rock > 0): distance-like in air. */
export function distanceAt(cs: CollisionScratch, x: number, y: number, z: number): number {
  return cs.sampler.density(x, y, z);
}

/** [0, 1] from a field value: 1 touching rock, 0 at PROXIMITY_RANGE or further. */
export function proximityOf(d: number): number {
  const prox = -d / C.PROXIMITY_RANGE;
  return prox < 0 ? 0 : prox > 1 ? 1 : prox;
}

/** [0, 1]: 1 touching rock, 0 at PROXIMITY_RANGE or further. */
export function proximityAt(cs: CollisionScratch, x: number, y: number, z: number): number {
  return proximityOf(distanceAt(cs, x, y, z));
}
