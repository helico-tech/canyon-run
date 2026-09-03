// Hashed feature placement and signed distances (research 03 §2.4). Features are
// pure functions of (seed, feature cell); any evaluator anywhere reconstructs the
// same set, so chunk meshing and simulation collision agree.
import type { FieldParams } from './params.ts';
import { hash1, hash2, noise3, unit01 } from './noise.ts';
import { spine, createSpine } from './spine.ts';

/**
 * Distance returned when no feature is nearer. Evaluators gather features within
 * `FEATURE_CLAMP + max effective radius`, so every evaluator returns the same
 * value at every point regardless of how large a region it gathered for.
 */
export const FEATURE_CLAMP = 40;

export const FEATURE_PILLAR = 0;
export const FEATURE_BOULDER = 1;
export const FEATURE_ARCH = 2;
/** Carved capsule (air), unlike the rock features above. */
export const FEATURE_TUNNEL = 3;
/** Tilted hexagonal prism (rock), coloured as crystal by the mesher. */
export const FEATURE_CRYSTAL = 4;

/** 8 tilt angles from -35° to +35° as (cos, sin) literals. */
const TILT = new Float64Array([
  0.8192, -0.5736, 0.9063, -0.4226, 0.9659, -0.2588, 0.9962, -0.0872, 0.9962, 0.0872, 0.9659,
  0.2588, 0.9063, 0.4226, 0.8192, 0.5736,
]);

/** 16 unit-ish directions in the x/z plane with a slight upward tilt (literals, no trig at runtime). */
const TUNNEL_DIRS = new Float64Array([
  1, 0.1, 0, 0.9239, 0.1, 0.3827, 0.7071, 0.1, 0.7071, 0.3827, 0.1, 0.9239, 0, 0.1, 1, -0.3827, 0.1,
  0.9239, -0.7071, 0.1, 0.7071, -0.9239, 0.1, 0.3827, -1, 0.1, 0, -0.9239, 0.1, -0.3827, -0.7071,
  0.1, -0.7071, -0.3827, 0.1, -0.9239, 0, 0.1, -1, 0.3827, 0.1, -0.9239, 0.7071, 0.1, -0.7071,
  0.9239, 0.1, -0.3827,
]);

export interface Feature {
  kind: number;
  x: number;
  y: number;
  z: number;
  r: number;
  /** Arch ring radius; tunnel length otherwise. */
  big: number;
  /** Axis-aligned reach for the early-out. */
  reach: number;
  /** Tunnel direction, or crystal tilt (cos/sin about z in dx/dy, about x in dz/big2). */
  dx: number;
  dy: number;
  dz: number;
  big2: number;
  /** Crystal colour index (0..2). */
  tint: number;
}

function feature(
  kind: number,
  x: number,
  y: number,
  z: number,
  r: number,
  big: number,
  reach: number,
): Feature {
  return { kind, x, y, z, r, big, reach, dx: 0, dy: 0, dz: 0, big2: 0, tint: 0 };
}

function pillarReach(p: FieldParams): number {
  return p.pillarRadius * 1.3 * 1.25 + FEATURE_CLAMP;
}
function boulderReach(p: FieldParams): number {
  return p.boulderRMax * 1.2 + FEATURE_CLAMP;
}
function archReach(p: FieldParams): number {
  return p.halfWidth * (1 + p.widthVar) * 1.1 + p.archRMax + FEATURE_CLAMP;
}
function crystalReach(p: FieldParams): number {
  return p.crystalHMax + p.crystalRMax + FEATURE_CLAMP;
}

/** Collects every feature whose reach can touch the box [x0,x1]×[z0,z1]. */
export function gatherFeatures(
  seed: number,
  p: FieldParams,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  out: Feature[] = [],
): Feature[] {
  out.length = 0;
  const sp = createSpine();
  if (p.pillarProb > 0) {
    const reach = pillarReach(p);
    const s = p.pillarSpacing;
    const gx0 = Math.floor((x0 - reach) / s);
    const gx1 = Math.floor((x1 + reach) / s);
    const gz0 = Math.floor((z0 - reach) / s);
    const gz1 = Math.floor((z1 + reach) / s);
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        if (unit01(hash2(gx, gz, seed ^ 0x5111)) > p.pillarProb) continue;
        const px = (gx + 0.2 + 0.6 * unit01(hash2(gx, gz, seed ^ 0x5222))) * s;
        const pz = (gz + 0.2 + 0.6 * unit01(hash2(gx, gz, seed ^ 0x5333))) * s;
        const r = p.pillarRadius * (0.7 + 0.6 * unit01(hash2(gx, gz, seed ^ 0x5444)));
        const fr = r * 1.25 + FEATURE_CLAMP;
        if (px + fr < x0 || px - fr > x1 || pz + fr < z0 || pz - fr > z1) continue;
        out.push(feature(FEATURE_PILLAR, px, 0, pz, r, 0, fr));
      }
    }
  }
  if (p.boulderProb > 0) {
    const reach = boulderReach(p);
    const s = p.boulderSpacing;
    const gx0 = Math.floor((x0 - reach) / s);
    const gx1 = Math.floor((x1 + reach) / s);
    const gz0 = Math.floor((z0 - reach) / s);
    const gz1 = Math.floor((z1 + reach) / s);
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        if (unit01(hash2(gx, gz, seed ^ 0x6111)) > p.boulderProb) continue;
        const bx = (gx + 0.15 + 0.7 * unit01(hash2(gx, gz, seed ^ 0x6222))) * s;
        const bz = (gz + 0.15 + 0.7 * unit01(hash2(gx, gz, seed ^ 0x6333))) * s;
        const r =
          p.boulderRMin + (p.boulderRMax - p.boulderRMin) * unit01(hash2(gx, gz, seed ^ 0x6444));
        const fr = r * 1.2 + FEATURE_CLAMP;
        if (bx + fr < x0 || bx - fr > x1 || bz + fr < z0 || bz - fr > z1) continue;
        spine(seed, bz, p, sp);
        out.push(feature(FEATURE_BOULDER, bx, sp.floorY + 0.4 * r, bz, r, 0, fr));
      }
    }
  }
  if (p.archProb > 0) {
    const reach = archReach(p);
    const s = p.archSpacing;
    const gz0 = Math.floor((z0 - reach) / s);
    const gz1 = Math.floor((z1 + reach) / s);
    for (let gz = gz0; gz <= gz1; gz++) {
      if (unit01(hash1(gz, seed ^ 0x7111)) > p.archProb) continue;
      const az = (gz + 0.2 + 0.6 * unit01(hash1(gz, seed ^ 0x7222))) * s;
      const r = p.archRMin + (p.archRMax - p.archRMin) * unit01(hash1(gz, seed ^ 0x7333));
      spine(seed, az, p, sp);
      const big = sp.hw * 1.1;
      const fr = big + r + FEATURE_CLAMP;
      if (az + fr < z0 || az - fr > z1 || sp.cx + fr < x0 || sp.cx - fr > x1) continue;
      out.push(feature(FEATURE_ARCH, sp.cx, sp.floorY + 0.25 * p.height, az, r, big, fr));
    }
  }
  if (p.crystalFloorProb > 0 || p.crystalWallProb > 0) {
    const reach = crystalReach(p);
    const s = p.crystalSpacing;
    const gx0 = Math.floor((x0 - reach) / s);
    const gx1 = Math.floor((x1 + reach) / s);
    const gz0 = Math.floor((z0 - reach) / s);
    const gz1 = Math.floor((z1 + reach) / s);
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const roll = unit01(hash2(gx, gz, seed ^ 0x9111));
        const cx = (gx + 0.15 + 0.7 * unit01(hash2(gx, gz, seed ^ 0x9222))) * s;
        const cz = (gz + 0.15 + 0.7 * unit01(hash2(gx, gz, seed ^ 0x9333))) * s;
        spine(seed, cz, p, sp);
        // Cells inside the corridor grow floor crystals; cells near the walls grow wall crystals.
        const rel = (cx - sp.cx) / sp.hw;
        let y: number;
        if (rel > -0.75 && rel < 0.75) {
          if (roll > p.crystalFloorProb) continue;
          y = sp.floorY - 12; // buried base: the warped floor can sit up to 14 u below floorY
        } else if (rel > -1.15 && rel < 1.15) {
          if (roll > p.crystalWallProb) continue;
          y = sp.floorY + p.height * (0.15 + 0.6 * unit01(hash2(gx, gz, seed ^ 0x9444)));
        } else continue;
        const r =
          p.crystalRMin + (p.crystalRMax - p.crystalRMin) * unit01(hash2(gx, gz, seed ^ 0x9555));
        const h =
          p.crystalHMin + (p.crystalHMax - p.crystalHMin) * unit01(hash2(gx, gz, seed ^ 0x9666));
        const fr = h + r + FEATURE_CLAMP;
        if (cx + fr < x0 || cx - fr > x1 || cz + fr < z0 || cz - fr > z1) continue;
        const f = feature(FEATURE_CRYSTAL, cx, y, cz, r, h, fr);
        const ti = hash2(gx, gz, seed ^ 0x9777);
        f.dx = TILT[(ti & 7) * 2]!;
        f.dy = TILT[(ti & 7) * 2 + 1]!;
        f.dz = TILT[((ti >>> 3) & 7) * 2]!;
        f.big2 = TILT[((ti >>> 3) & 7) * 2 + 1]!;
        f.tint = (ti >>> 6) % 3;
        out.push(f);
      }
    }
  }
  if (p.tunnelProb > 0) {
    const s = p.tunnelSpacing;
    const reach = p.tunnelLenMax + p.tunnelRMax + FEATURE_CLAMP;
    const gz0 = Math.floor((z0 - reach) / s);
    const gz1 = Math.floor((z1 + reach) / s);
    for (let gz = gz0; gz <= gz1; gz++) {
      if (unit01(hash1(gz, seed ^ 0x8111)) > p.tunnelProb) continue;
      const tz = (gz + 0.2 + 0.6 * unit01(hash1(gz, seed ^ 0x8222))) * s;
      const r = p.tunnelRMin + (p.tunnelRMax - p.tunnelRMin) * unit01(hash1(gz, seed ^ 0x8333));
      const len =
        p.tunnelLenMin + (p.tunnelLenMax - p.tunnelLenMin) * unit01(hash1(gz, seed ^ 0x8444));
      const side = hash1(gz, seed ^ 0x8555) & 1 ? 1 : -1;
      // Directions 0..7 point toward +x, 8..15 toward -x; pick the half that leaves the corridor.
      const di = (hash1(gz, seed ^ 0x8666) & 7) + (side > 0 ? 0 : 8);
      spine(seed, tz, p, sp);
      const fr = len + r + FEATURE_CLAMP;
      const x = sp.cx + side * sp.hw * 0.8;
      if (tz + fr < z0 || tz - fr > z1 || x + fr < x0 || x - fr > x1) continue;
      const f = feature(FEATURE_TUNNEL, x, sp.coreY, tz, r, len, fr);
      f.dx = TUNNEL_DIRS[di * 3]!;
      f.dy = TUNNEL_DIRS[di * 3 + 1]!;
      f.dz = TUNNEL_DIRS[di * 3 + 2]!;
      out.push(f);
    }
  }
  return out;
}

/** Signed distance to the nearest carved tunnel (air inside), clamped to FEATURE_CLAMP. */
export function tunnelsSD(x: number, y: number, z: number, list: Feature[]): number {
  let best = FEATURE_CLAMP;
  for (let i = 0; i < list.length; i++) {
    const f = list[i]!;
    if (f.kind !== FEATURE_TUNNEL) continue;
    const dx = x - f.x;
    const dz = z - f.z;
    if (dx > f.reach || dx < -f.reach || dz > f.reach || dz < -f.reach) continue;
    const dy = y - f.y;
    let t = dx * f.dx + dy * f.dy + dz * f.dz;
    t = t < 0 ? 0 : t > f.big ? f.big : t;
    const qx = dx - f.dx * t;
    const qy = dy - f.dy * t;
    const qz = dz - f.dz * t;
    const sd = Math.sqrt(qx * qx + qy * qy + qz * qz) - f.r;
    if (sd < best) best = sd;
  }
  return best;
}

/** Signed distance to the nearest gathered rock feature (rock inside), clamped to FEATURE_CLAMP. */
export function featuresSD(seed: number, x: number, y: number, z: number, list: Feature[]): number {
  let best = FEATURE_CLAMP;
  for (let i = 0; i < list.length; i++) {
    const f = list[i]!;
    if (f.kind === FEATURE_TUNNEL) continue;
    const dx = x - f.x;
    const dz = z - f.z;
    if (dx > f.reach || dx < -f.reach || dz > f.reach || dz < -f.reach) continue;
    let sd: number;
    if (f.kind === FEATURE_PILLAR) {
      // The bulge is within ±25 % of r; skip the noise when it cannot beat `best` (exact).
      const d0 = Math.sqrt(dx * dx + dz * dz) - f.r;
      if (d0 - 0.25 * f.r >= best) continue;
      const bulge = 1 + 0.25 * noise3(f.x * 0.05, y * 0.08, f.z * 0.05, seed ^ 0x5555);
      sd = d0 - f.r * (bulge - 1);
    } else if (f.kind === FEATURE_BOULDER) {
      const dy = y - f.y;
      const d0 = Math.sqrt(dx * dx + dy * dy + dz * dz) - f.r;
      if (d0 - 0.2 * f.r >= best) continue;
      const bulge = 1 + 0.2 * noise3(x * 0.15, y * 0.15, z * 0.15, seed ^ 0x6555);
      sd = d0 - f.r * (bulge - 1);
    } else if (f.kind === FEATURE_CRYSTAL) {
      sd = crystalSD(f, dx, y - f.y, dz);
    } else {
      const dy = y - f.y;
      const ring = Math.sqrt(dx * dx + dy * dy) - f.big;
      sd = Math.sqrt(ring * ring + dz * dz) - f.r;
    }
    if (sd < best) best = sd;
  }
  return best;
}

/** Hex prism of radius r and height big, tilted about z then x, base at the feature origin. */
export function crystalSD(f: Feature, dx: number, dy: number, dz: number): number {
  // Inverse rotation: about x by -(dz,big2), then about z by -(dx,dy).
  const y1 = f.dz * dy + f.big2 * dz;
  const z1 = -f.big2 * dy + f.dz * dz;
  const x2 = f.dx * dx + f.dy * y1;
  const y2 = -f.dy * dx + f.dx * y1;
  const ax = Math.abs(x2);
  const az = Math.abs(z1);
  const hex = Math.max(ax * 0.866 + az * 0.5, az) - f.r;
  const cap = Math.abs(y2 - f.big * 0.5) - f.big * 0.5;
  return Math.max(hex, cap);
}

/** Index of the nearest crystal within `within` of the point, or -1. */
export function crystalNear(
  x: number,
  y: number,
  z: number,
  list: Feature[],
  within: number,
): Feature | null {
  let best = within;
  let hit: Feature | null = null;
  for (let i = 0; i < list.length; i++) {
    const f = list[i]!;
    if (f.kind !== FEATURE_CRYSTAL) continue;
    const dx = x - f.x;
    const dz = z - f.z;
    if (dx > f.reach || dx < -f.reach || dz > f.reach || dz < -f.reach) continue;
    const sd = crystalSD(f, dx, y - f.y, dz);
    if (sd < best) {
      best = sd;
      hit = f;
    }
  }
  return hit;
}
