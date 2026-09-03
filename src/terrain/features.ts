// Hashed feature placement and signed distances (research 03 §2.4). Features are
// pure functions of (seed, feature cell); any evaluator anywhere reconstructs the
// same set, so chunk meshing and simulation collision agree.
import type { FieldParams } from './params.ts';
import { hash1, hash2, hash3, noise3, unit01 } from './noise.ts';
import { spine, createSpine } from './spine.ts';
import { distanceToBoundary, inClearZone, segmentAt } from './biomes.ts';
import { CLEAR_HALF } from './difficulty.ts';

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
/** Rounded box on the floor (rock). */
export const FEATURE_MESA = 5;
/** Floating ellipsoid rock on a 3D cell. */
export const FEATURE_ROCK = 6;
/** Biome gate: two pillars and a lintel at a segment boundary, accent coloured. */
export const FEATURE_GATE = 7;
/** Axis-aligned rounded box (rounding 1 u): greebles, towers and beams. */
export const FEATURE_BOX = 8;
export const GATE_RADIUS = 5;
/** Sill across the floor between the pillars: half height and half depth (u). */
export const GATE_SILL_H = 2;
export const GATE_SILL_D = 2.5;
export const GATE_LINTEL_DROP = 22;

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

/** Inclusive cell index range covering [lo − reach, hi + reach] on a lattice of spacing s. */
function cellRange(lo: number, hi: number, reach: number, s: number): [number, number] {
  return [Math.floor((lo - reach) / s), Math.floor((hi + reach) / s)];
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
function boxReach(p: FieldParams): number {
  return Math.max(p.boxHalfMax, p.boxHeightMax, p.halfWidth * 1.5 + p.beamHalf) + FEATURE_CLAMP;
}
function crystalReach(p: FieldParams): number {
  return p.crystalHMax + p.crystalRMax + FEATURE_CLAMP;
}
function mesaReach(p: FieldParams): number {
  return p.mesaSizeMax + FEATURE_CLAMP;
}
function rockReach(p: FieldParams): number {
  return p.rockRMax * 1.5 * 1.2 + FEATURE_CLAMP;
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
    const [gx0, gx1] = cellRange(x0, x1, reach, s);
    const [gz0, gz1] = cellRange(z0, z1, reach, s);
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        if (unit01(hash2(gx, gz, seed ^ 0x5111)) > p.pillarProb) continue;
        const px = (gx + 0.2 + 0.6 * unit01(hash2(gx, gz, seed ^ 0x5222))) * s;
        const pz = (gz + 0.2 + 0.6 * unit01(hash2(gx, gz, seed ^ 0x5333))) * s;
        const r = p.pillarRadius * (0.7 + 0.6 * unit01(hash2(gx, gz, seed ^ 0x5444)));
        const fr = r * 1.25 + FEATURE_CLAMP;
        if (px + fr < x0 || px - fr > x1 || pz + fr < z0 || pz - fr > z1) continue;
        if (inClearZone(pz)) continue;
        const pf = feature(FEATURE_PILLAR, px, 0, pz, r, 0, fr);
        pf.big2 = p.pillarStepLen;
        out.push(pf);
      }
    }
  }
  if (p.boulderProb > 0) {
    const reach = boulderReach(p);
    const s = p.boulderSpacing;
    const [gx0, gx1] = cellRange(x0, x1, reach, s);
    const [gz0, gz1] = cellRange(z0, z1, reach, s);
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        if (unit01(hash2(gx, gz, seed ^ 0x6111)) > p.boulderProb) continue;
        const bx = (gx + 0.15 + 0.7 * unit01(hash2(gx, gz, seed ^ 0x6222))) * s;
        const bz = (gz + 0.15 + 0.7 * unit01(hash2(gx, gz, seed ^ 0x6333))) * s;
        const r =
          p.boulderRMin + (p.boulderRMax - p.boulderRMin) * unit01(hash2(gx, gz, seed ^ 0x6444));
        const fr = r * 1.2 + FEATURE_CLAMP;
        if (bx + fr < x0 || bx - fr > x1 || bz + fr < z0 || bz - fr > z1) continue;
        if (inClearZone(bz)) continue;
        spine(seed, bz, p, sp);
        out.push(feature(FEATURE_BOULDER, bx, sp.floorY + 0.4 * r, bz, r, 0, fr));
      }
    }
  }
  if (p.archProb > 0) {
    const reach = archReach(p);
    const s = p.archSpacing;
    const [gz0, gz1] = cellRange(z0, z1, reach, s);
    for (let gz = gz0; gz <= gz1; gz++) {
      if (unit01(hash1(gz, seed ^ 0x7111)) > p.archProb) continue;
      const az = (gz + 0.2 + 0.6 * unit01(hash1(gz, seed ^ 0x7222))) * s;
      const r = p.archRMin + (p.archRMax - p.archRMin) * unit01(hash1(gz, seed ^ 0x7333));
      spine(seed, az, p, sp);
      const big = sp.hw * 1.1;
      const fr = big + r + FEATURE_CLAMP;
      if (az + fr < z0 || az - fr > z1 || sp.cx + fr < x0 || sp.cx - fr > x1) continue;
      if (distanceToBoundary(az) < CLEAR_HALF + r) continue;
      out.push(feature(FEATURE_ARCH, sp.cx, sp.floorY + 0.25 * p.height, az, r, big, fr));
    }
  }
  if (p.crystalFloorProb > 0 || p.crystalWallProb > 0) {
    const reach = crystalReach(p);
    const s = p.crystalSpacing;
    const [gx0, gx1] = cellRange(x0, x1, reach, s);
    const [gz0, gz1] = cellRange(z0, z1, reach, s);
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
        if (inClearZone(cz)) continue;
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
  if (p.rockProb > 0) {
    const reach = rockReach(p);
    const s = p.rockSpacing;
    const [gx0, gx1] = cellRange(x0, x1, reach, s);
    const [gz0, gz1] = cellRange(z0, z1, reach, s);
    for (let gz = gz0; gz <= gz1; gz++) {
      spine(seed, (gz + 0.5) * s, p, sp);
      const gy0 = Math.floor((sp.floorY + 10) / s);
      const gy1 = Math.floor((sp.ceilY - 10) / s);
      for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          if (unit01(hash3(gx, gy, gz, seed ^ 0xb111)) > p.rockProb) continue;
          const rx = (gx + 0.2 + 0.6 * unit01(hash3(gx, gy, gz, seed ^ 0xb222))) * s;
          const ry = (gy + 0.2 + 0.6 * unit01(hash3(gx, gy, gz, seed ^ 0xb333))) * s;
          const rz = (gz + 0.2 + 0.6 * unit01(hash3(gx, gy, gz, seed ^ 0xb444))) * s;
          // Only inside the corridor, away from the walls and the core.
          if (Math.abs(rx - sp.cx) > sp.hw * 0.85) continue;
          const r =
            p.rockRMin + (p.rockRMax - p.rockRMin) * unit01(hash3(gx, gy, gz, seed ^ 0xb555));
          const fr = r * 1.5 * 1.2 + FEATURE_CLAMP;
          if (rx + fr < x0 || rx - fr > x1 || rz + fr < z0 || rz - fr > z1) continue;
          if (distanceToBoundary(rz) < CLEAR_HALF + r * 1.5) continue;
          const f = feature(FEATURE_ROCK, rx, ry, rz, r, 0, fr);
          // Per-axis scale in [0.7, 1.5] from the hash: dx, dy, dz.
          const h = hash3(gx, gy, gz, seed ^ 0xb666);
          f.dx = 0.7 + 0.8 * ((h & 255) / 255);
          f.dy = 0.7 + 0.8 * (((h >>> 8) & 255) / 255);
          f.dz = 0.7 + 0.8 * (((h >>> 16) & 255) / 255);
          out.push(f);
        }
      }
    }
  }
  if (p.mesaProb > 0) {
    const reach = mesaReach(p);
    const s = p.mesaSpacing;
    const [gx0, gx1] = cellRange(x0, x1, reach, s);
    const [gz0, gz1] = cellRange(z0, z1, reach, s);
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        if (unit01(hash2(gx, gz, seed ^ 0xa111)) > p.mesaProb) continue;
        const mx = (gx + 0.2 + 0.6 * unit01(hash2(gx, gz, seed ^ 0xa222))) * s;
        const mz = (gz + 0.2 + 0.6 * unit01(hash2(gx, gz, seed ^ 0xa333))) * s;
        const size =
          p.mesaSizeMin + (p.mesaSizeMax - p.mesaSizeMin) * unit01(hash2(gx, gz, seed ^ 0xa444));
        const fr = size + FEATURE_CLAMP;
        if (mx + fr < x0 || mx - fr > x1 || mz + fr < z0 || mz - fr > z1) continue;
        if (distanceToBoundary(mz) < CLEAR_HALF + size) continue;
        spine(seed, mz, p, sp);
        const f = feature(FEATURE_MESA, mx, sp.floorY - 6, mz, size * 0.5, p.mesaHeight, fr);
        f.big2 = size * (0.5 + 0.4 * unit01(hash2(gx, gz, seed ^ 0xa555))) * 0.5; // half depth
        out.push(f);
      }
    }
  }
  {
    // One gate per segment boundary inside the box (plus reach).
    const reach = p.halfWidth * 1.5 + GATE_RADIUS + FEATURE_CLAMP;
    let seg = segmentAt(z0 - reach);
    for (let guard = 0; guard < 8 && Number.isFinite(seg.end) && seg.end <= z1 + reach; guard++) {
      const gz = seg.end;
      spine(seed, gz, p, sp);
      const half = sp.hw * 0.9;
      const fr = half + GATE_RADIUS + FEATURE_CLAMP;
      if (!(gz + fr < z0 || gz - fr > z1 || sp.cx + fr < x0 || sp.cx - fr > x1)) {
        const f = feature(FEATURE_GATE, sp.cx, sp.floorY - 4, gz, GATE_RADIUS, half, fr);
        f.big2 = sp.ceilY - GATE_LINTEL_DROP - (sp.floorY - 4); // pillar height
        out.push(f);
      }
      seg = segmentAt(gz + 1);
    }
  }
  if (p.boxFloorProb > 0 || p.boxWallProb > 0 || p.towerProb > 0 || p.beamProb > 0) {
    const reach = boxReach(p);
    const box = (x: number, y: number, z: number, hx: number, hy: number, hz: number): void => {
      const fr = Math.max(hx, hy, hz) + FEATURE_CLAMP;
      if (x + fr < x0 || x - fr > x1 || z + fr < z0 || z - fr > z1) return;
      if (inClearZone(z)) return;
      const f = feature(FEATURE_BOX, x, y, z, hx, hy, fr);
      f.big2 = hz;
      out.push(f);
    };
    if (p.boxFloorProb > 0 || p.towerProb > 0) {
      const sF = p.boxFloorSpacing;
      const [gx0, gx1] = cellRange(x0, x1, reach, sF);
      const [gz0, gz1] = cellRange(z0, z1, reach, sF);
      for (let gz = gz0; gz <= gz1; gz++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          const roll = unit01(hash2(gx, gz, seed ^ 0xc111));
          if (roll > p.boxFloorProb) continue;
          const bx = (gx + 0.2 + 0.6 * unit01(hash2(gx, gz, seed ^ 0xc222))) * sF;
          const bz = (gz + 0.2 + 0.6 * unit01(hash2(gx, gz, seed ^ 0xc333))) * sF;
          spine(seed, bz, p, sp);
          if (Math.abs(bx - sp.cx) > sp.hw * 0.8) continue;
          const hx =
            p.boxHalfMin + (p.boxHalfMax - p.boxHalfMin) * unit01(hash2(gx, gz, seed ^ 0xc444));
          const hz =
            p.boxHalfMin + (p.boxHalfMax - p.boxHalfMin) * unit01(hash2(gx, gz, seed ^ 0xc555));
          const hy =
            p.boxHeightMin +
            (p.boxHeightMax - p.boxHeightMin) * unit01(hash2(gx, gz, seed ^ 0xc666));
          box(bx, sp.floorY - 2 + hy, bz, hx, hy + 2, hz);
        }
      }
    }
    if (p.towerProb > 0) {
      const sT = p.towerSpacing;
      const [gx0, gx1] = cellRange(x0, x1, reach, sT);
      const [gz0, gz1] = cellRange(z0, z1, reach, sT);
      for (let gz = gz0; gz <= gz1; gz++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          if (unit01(hash2(gx, gz, seed ^ 0xd111)) > p.towerProb) continue;
          const tx = (gx + 0.25 + 0.5 * unit01(hash2(gx, gz, seed ^ 0xd222))) * sT;
          const tz = (gz + 0.25 + 0.5 * unit01(hash2(gx, gz, seed ^ 0xd333))) * sT;
          spine(seed, tz, p, sp);
          // Towers hug the walls so the centre stays flyable.
          const side = hash2(gx, gz, seed ^ 0xd444) & 1 ? 1 : -1;
          const x = sp.cx + side * sp.hw * (0.55 + 0.25 * unit01(hash2(gx, gz, seed ^ 0xd555)));
          const half = 3 + 2 * unit01(hash2(gx, gz, seed ^ 0xd666));
          const height = 0.35 * p.height + 0.3 * p.height * unit01(hash2(gx, gz, seed ^ 0xd777));
          void tx;
          box(x, sp.floorY - 2 + height * 0.5, tz, half, height * 0.5 + 2, half);
        }
      }
    }
    if (p.boxWallProb > 0) {
      const sW = p.boxWallSpacing;
      const [gx0, gx1] = cellRange(x0, x1, reach, sW);
      const [gz0, gz1] = cellRange(z0, z1, reach, sW);
      for (let gz = gz0; gz <= gz1; gz++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          if (unit01(hash2(gx, gz, seed ^ 0xe111)) > p.boxWallProb) continue;
          const wz = (gz + 0.2 + 0.6 * unit01(hash2(gx, gz, seed ^ 0xe222))) * sW;
          spine(seed, wz, p, sp);
          // Wall cells: only cells straddling a wall grow greebles (one per wall per cell row).
          const cellX = (gx + 0.5) * sW;
          const rel = (cellX - sp.cx) / sp.hw;
          if (Math.abs(rel) < 0.7 || Math.abs(rel) > 1.3) continue;
          const side = rel > 0 ? 1 : -1;
          const hx =
            p.boxHalfMin + (p.boxHalfMax - p.boxHalfMin) * unit01(hash2(gx, gz, seed ^ 0xe333));
          const hy =
            p.boxHalfMin + (p.boxHalfMax - p.boxHalfMin) * unit01(hash2(gx, gz, seed ^ 0xe444));
          const hz =
            p.boxHalfMin + (p.boxHalfMax - p.boxHalfMin) * unit01(hash2(gx, gz, seed ^ 0xe555));
          const y = sp.floorY + p.height * (0.1 + 0.75 * unit01(hash2(gx, gz, seed ^ 0xe666)));
          box(sp.cx + side * (sp.hw + hx * 0.4), y, wz, hx, hy, hz);
        }
      }
    }
    if (p.beamProb > 0) {
      const sB = p.beamSpacing;
      const [gz0, gz1] = cellRange(z0, z1, reach, sB);
      for (let gz = gz0; gz <= gz1; gz++) {
        if (unit01(hash1(gz, seed ^ 0xf111)) > p.beamProb) continue;
        const bz = (gz + 0.2 + 0.6 * unit01(hash1(gz, seed ^ 0xf222))) * sB;
        spine(seed, bz, p, sp);
        // Beams sit between the core tube's top and the ceiling clamp: flyable under, never through the core.
        const lo = sp.coreY + p.coreRadius + p.beamHalf + 2;
        const hi = sp.ceilY - 24;
        if (hi <= lo) continue;
        const y = lo + (hi - lo) * unit01(hash1(gz, seed ^ 0xf333));
        box(sp.cx, y, bz, sp.hw * 1.3, p.beamHalf, p.beamHalf);
      }
    }
  }
  if (p.tunnelProb > 0) {
    const s = p.tunnelSpacing;
    const reach = p.tunnelLenMax + p.tunnelRMax + FEATURE_CLAMP;
    const [gz0, gz1] = cellRange(z0, z1, reach, s);
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
      if (distanceToBoundary(tz) < CLEAR_HALF + len) continue;
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
      // The bulge is within ±25 % of r (±55 % with steps); skip the noise when it cannot beat `best` (exact).
      const d0 = Math.sqrt(dx * dx + dz * dz) - f.r;
      if (d0 - 0.55 * f.r >= best) continue;
      let bulge = 1 + 0.25 * noise3(f.x * 0.05, y * 0.08, f.z * 0.05, seed ^ 0x5555);
      if (f.big2 > 0) bulge += 0.3 * (Math.floor(y / f.big2) & 1);
      sd = d0 - f.r * (bulge - 1);
    } else if (f.kind === FEATURE_BOULDER) {
      const dy = y - f.y;
      const d0 = Math.sqrt(dx * dx + dy * dy + dz * dz) - f.r;
      if (d0 - 0.2 * f.r >= best) continue;
      const bulge = 1 + 0.2 * noise3(x * 0.15, y * 0.15, z * 0.15, seed ^ 0x6555);
      sd = d0 - f.r * (bulge - 1);
    } else if (f.kind === FEATURE_CRYSTAL) {
      sd = crystalSD(f, dx, y - f.y, dz);
    } else if (f.kind === FEATURE_ROCK) {
      const dy = y - f.y;
      const ex = dx / (f.r * f.dx);
      const ey = dy / (f.r * f.dy);
      const ez = dz / (f.r * f.dz);
      const minAxis = f.r * (f.dx < f.dy ? (f.dx < f.dz ? f.dx : f.dz) : f.dy < f.dz ? f.dy : f.dz);
      const d0 = (Math.sqrt(ex * ex + ey * ey + ez * ez) - 1) * minAxis;
      if (d0 - 0.2 * f.r >= best) continue;
      const bulge = 0.2 * f.r * noise3(x * 0.12, y * 0.12, z * 0.12, seed ^ 0xb777);
      sd = d0 - bulge;
    } else if (f.kind === FEATURE_GATE) {
      sd = gateSD(f, dx, y - f.y, dz);
    } else if (f.kind === FEATURE_BOX) {
      const qx = Math.abs(dx) - f.r + 1;
      const qy = Math.abs(y - f.y) - f.big + 1;
      const qz = Math.abs(dz) - f.big2 + 1;
      const ox = qx > 0 ? qx : 0;
      const oy = qy > 0 ? qy : 0;
      const oz = qz > 0 ? qz : 0;
      const inside = Math.max(qx, Math.max(qy, qz));
      sd = Math.sqrt(ox * ox + oy * oy + oz * oz) + (inside < 0 ? inside : 0) - 1;
    } else if (f.kind === FEATURE_MESA) {
      // Rounded box: half extents r (x), big (y, from the base), big2 (z); rounding 3 u.
      const qx = Math.abs(dx) - f.r + 3;
      const qy = Math.abs(y - f.y - f.big * 0.5) - f.big * 0.5 + 3;
      const qz = Math.abs(dz) - f.big2 + 3;
      const ox = qx > 0 ? qx : 0;
      const oy = qy > 0 ? qy : 0;
      const oz = qz > 0 ? qz : 0;
      const inside = Math.max(qx, Math.max(qy, qz));
      sd = Math.sqrt(ox * ox + oy * oy + oz * oz) + (inside < 0 ? inside : 0) - 3;
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
    if (f.kind !== FEATURE_CRYSTAL && f.kind !== FEATURE_GATE) continue;
    const dx = x - f.x;
    const dz = z - f.z;
    if (dx > f.reach || dx < -f.reach || dz > f.reach || dz < -f.reach) continue;
    const sd = f.kind === FEATURE_GATE ? gateSD(f, dx, y - f.y, dz) : crystalSD(f, dx, y - f.y, dz);
    if (sd < best) {
      best = sd;
      hit = f;
    }
  }
  return hit;
}

export function gateSD(f: Feature, dx: number, dy: number, dz: number): number {
  const ax = Math.abs(dx) - f.big;
  const ty = dy < 0 ? 0 : dy > f.big2 ? f.big2 : dy;
  const pillar = Math.sqrt(ax * ax + (dy - ty) * (dy - ty) + dz * dz) - f.r;
  const lx = dx < -f.big ? -f.big : dx > f.big ? f.big : dx;
  const ly = dy - f.big2;
  const lintel = Math.sqrt((dx - lx) * (dx - lx) + ly * ly + dz * dz) - f.r;
  // Sill: a low rounded box across the floor (the feature's y sits 4 u below the floor).
  const qx = Math.abs(dx) - f.big;
  const qy = Math.abs(dy - 4) - GATE_SILL_H;
  const qz = Math.abs(dz) - GATE_SILL_D;
  const px = qx > 0 ? qx : 0;
  const py = qy > 0 ? qy : 0;
  const pz = qz > 0 ? qz : 0;
  const inner = qx > qy ? (qx > qz ? qx : qz) : qy > qz ? qy : qz;
  const sill = Math.sqrt(px * px + py * py + pz * pz) + (inner < 0 ? inner : 0) - 0.5;
  const frame = pillar < lintel ? pillar : lintel;
  return frame < sill ? frame : sill;
}
