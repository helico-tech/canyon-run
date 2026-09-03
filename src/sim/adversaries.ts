// Adversaries: stateless stations at fixed z with closed-form cross-section motion
// (ADR 0007, docs/specs/2026-09-03-adversaries.md). Only + - * / floor abs sqrt
// min max and literal tables, so the sim (integer ticks) and the renderer
// (fractional time) evaluate the same poses bit-identically at every tick.
import {
  adversariesOf,
  biomeForSegment,
  BLEND_LENGTH,
  distanceToBoundary,
  segmentAt,
  blendAt,
  createBlend,
} from '../terrain/biomes.ts';
import { ADVERSARY_FACTOR, ADVERSARY_SPEED, tableAt } from '../terrain/difficulty.ts';
import { spineAt } from '../terrain/field.ts';
import { CHUNK_SIZE } from '../terrain/march.ts';
import { hash2, smoothstep, unit01 } from '../terrain/noise.ts';
import type { AdversaryParams } from '../terrain/params.ts';
import type { Spine } from '../terrain/spine.ts';
import { createSpine } from '../terrain/spine.ts';
import { HULL_PROBES } from './collision.ts';
import { C } from './constants.ts';
import { rotate } from './quat.ts';

export const SHAPE_BOX = 0;
export const SHAPE_WEDGE = 1;
export const SHAPE_RING = 2;
export const SHAPE_BLADE = 3;

export const MOTION_STATIC = 0;
export const MOTION_SWEEP_X = 1;
export const MOTION_SWEEP_Y = 2;
export const MOTION_BOUNCE_X = 3;
export const MOTION_ORBIT = 4;
export const MOTION_CLOSE = 5;

/** Archetype rows [shape, motion, spin turns per period]. Ids are stable: replays depend on them. */
export const ARCHETYPES: ReadonlyArray<readonly [number, number, number]> = [
  [SHAPE_BLADE, MOTION_STATIC, 1], // 0 spinning blade
  [SHAPE_BOX, MOTION_BOUNCE_X, 0], // 1 bouncing block
  [SHAPE_BOX, MOTION_SWEEP_Y, 0], // 2 piston
  [SHAPE_RING, MOTION_SWEEP_X, 0], // 3 drifting hoop
  [SHAPE_WEDGE, MOTION_ORBIT, 0], // 4 orbiting shard
  [SHAPE_BOX, MOTION_CLOSE, 0], // 5 closing jaws
  [SHAPE_BLADE, MOTION_SWEEP_X, 1], // 6 sweeping, spinning blade
];

export const ADV_MAX = 32;

export interface Station {
  id: number;
  seg: number;
  z: number;
  shape: number;
  motion: number;
  spin: number;
  cx: number;
  cy: number;
  ax: number;
  ay: number;
  r: number;
  len: number;
  hz: number;
  period: number;
  phase: number;
  gapMin: number;
  gapMax: number;
  closeDist: number;
  core: number;
  reach: number;
}

export function createStation(): Station {
  return {
    id: 0,
    seg: 0,
    z: 0,
    shape: 0,
    motion: 0,
    spin: 0,
    cx: 0,
    cy: 0,
    ax: 0,
    ay: 0,
    r: 2,
    len: 4,
    hz: 1.5,
    period: 60,
    phase: 0,
    gapMin: 28,
    gapMax: 28,
    closeDist: 200,
    core: 12,
    reach: 40,
  };
}

export interface AdvPose {
  x: number;
  y: number;
  c: number;
  s: number;
  gap: number;
}

export function createPose(): AdvPose {
  return { x: 0, y: 0, c: 1, s: 0, gap: 0 };
}

// ---- motion primitives ------------------------------------------------------

/** Fraction of the period in [0, 1); exact for integer time. */
export function phase01(time: number, period: number, phase: number): number {
  const u = (time + phase) / period;
  return u - Math.floor(u);
}

/** Triangle wave: -1 at u = 0, +1 at u = 0.5, -1 at u = 1. */
export function tri(u: number): number {
  return 1 - Math.abs(4 * u - 2);
}

/** Smooth pendulum: the triangle eased by the cubic smoothstep; zero velocity at the ends. */
export function swing(u: number): number {
  const t = 0.5 + 0.5 * tri(u);
  return 2 * t * t * (3 - 2 * t) - 1;
}

/** 32 literal (cos, sin) pairs at 11.25° steps. */
const CIRCLE = new Float64Array([
  1, 0, 0.98078528, 0.19509032, 0.92387953, 0.38268343, 0.83146961, 0.55557023, 0.70710678,
  0.70710678, 0.55557023, 0.83146961, 0.38268343, 0.92387953, 0.19509032, 0.98078528, 0, 1,
  -0.19509032, 0.98078528, -0.38268343, 0.92387953, -0.55557023, 0.83146961, -0.70710678,
  0.70710678, -0.83146961, 0.55557023, -0.92387953, 0.38268343, -0.98078528, 0.19509032, -1, 0,
  -0.98078528, -0.19509032, -0.92387953, -0.38268343, -0.83146961, -0.55557023, -0.70710678,
  -0.70710678, -0.55557023, -0.83146961, -0.38268343, -0.92387953, -0.19509032, -0.98078528, 0, -1,
  0.19509032, -0.98078528, 0.38268343, -0.92387953, 0.55557023, -0.83146961, 0.70710678,
  -0.70710678, 0.83146961, -0.55557023, 0.92387953, -0.38268343, 0.98078528, -0.19509032,
]);

/** Unit vector at turn fraction u: out[o] = cos, out[o+1] = sin (lerp between table entries, renormalised). */
export function circle(u: number, out: Float64Array, o: number): void {
  const f = (u - Math.floor(u)) * 32;
  const i = Math.floor(f);
  const t = f - i;
  const j = (i + 1) & 31;
  const c = CIRCLE[i * 2]! + (CIRCLE[j * 2]! - CIRCLE[i * 2]!) * t;
  const s = CIRCLE[i * 2 + 1]! + (CIRCLE[j * 2 + 1]! - CIRCLE[i * 2 + 1]!) * t;
  const inv = 1 / Math.sqrt(c * c + s * s);
  out[o] = c * inv;
  out[o + 1] = s * inv;
}

const tmp2 = new Float64Array(2);

/** Pose at `time` (ticks, may be fractional) with the plane at `planeZ` (approach laws). */
export function advPoseAt(st: Station, time: number, planeZ: number, out: AdvPose): void {
  const u = phase01(time, st.period, st.phase);
  let x = st.cx;
  let y = st.cy;
  out.gap = 0;
  if (st.motion === MOTION_SWEEP_X) x += st.ax * swing(u);
  else if (st.motion === MOTION_SWEEP_Y) y += st.ay * swing(u);
  else if (st.motion === MOTION_BOUNCE_X) x += st.ax * tri(u);
  else if (st.motion === MOTION_ORBIT) {
    circle(u, tmp2, 0);
    x += st.ax * tmp2[0]!;
    y += st.ay * tmp2[1]!;
  } else if (st.motion === MOTION_CLOSE) {
    const dz = st.z - planeZ;
    const k = smoothstep(0, st.closeDist, dz);
    out.gap = 0.5 * (st.gapMin + (st.gapMax - st.gapMin) * k);
    x += out.gap + st.len;
  }
  out.x = x;
  out.y = y;
  if (st.spin !== 0) {
    circle(st.spin * u, tmp2, 0);
    out.c = tmp2[0]!;
    out.s = tmp2[1]!;
  } else {
    out.c = 1;
    out.s = 0;
  }
}

// ---- signed distance ----------------------------------------------------------

function extrude(d2: number, dz: number, hz: number): number {
  const wz = Math.abs(dz) - hz;
  const ox = d2 > 0 ? d2 : 0;
  const oz = wz > 0 ? wz : 0;
  const inside = d2 > wz ? d2 : wz;
  return Math.sqrt(ox * ox + oz * oz) + (inside < 0 ? inside : 0);
}

/** Isosceles triangle (apex up), half base `hb`, height `h`; exact 2D SDF (Quilez). */
function triangleSD(px: number, py: number, hb: number, h: number): number {
  const x = Math.abs(px);
  const y = py + h * 0.5; // base at y = -h/2, apex at +h/2
  // Edge from base corner (hb, 0) to apex (0, h).
  const ex = -hb;
  const ey = h;
  const wx = x - hb;
  const wy = y;
  let t = (wx * ex + wy * ey) / (ex * ex + ey * ey);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ax = wx - ex * t;
  const ay = wy - ey * t;
  const dEdge = Math.sqrt(ax * ax + ay * ay);
  // Base edge from (0, 0) to (hb, 0).
  const bx = x - (x < hb ? x : hb);
  const dBase = Math.sqrt(bx * bx + y * y);
  const d = dEdge < dBase ? dEdge : dBase;
  // Inside test: y > 0 and left of the edge line.
  const cross = ex * wy - ey * wx;
  const inside = y > 0 && cross > 0;
  return inside ? -d : d;
}

/** Signed distance from (x, y, z) to the station's body at pose p (inside < 0), clamped at ADV_CLAMP. */
export function stationSD(st: Station, p: AdvPose, x: number, y: number, z: number): number {
  const dz = z - st.z;
  if (dz > st.reach || dz < -st.reach) return C.ADV_CLAMP;
  let dx = x - p.x;
  let dy = y - p.y;
  if (st.motion === MOTION_CLOSE) {
    dx = Math.abs(x - st.cx) - (p.gap + st.len);
    dy = y - st.cy;
  }
  const bx = p.c * dx + p.s * dy;
  const by = -p.s * dx + p.c * dy;
  let d2: number;
  if (st.shape === SHAPE_RING) {
    d2 = Math.abs(Math.sqrt(bx * bx + by * by) - st.len) - st.r;
  } else if (st.shape === SHAPE_WEDGE) {
    d2 = triangleSD(bx, by, st.len, 2 * st.r);
  } else {
    const qx = Math.abs(bx) - st.len + 0.5;
    const qy = Math.abs(by) - st.r + 0.5;
    const ox = qx > 0 ? qx : 0;
    const oy = qy > 0 ? qy : 0;
    const inside = qx > qy ? qx : qy;
    d2 = Math.sqrt(ox * ox + oy * oy) + (inside < 0 ? inside : 0) - 0.5;
  }
  const sd = extrude(d2, dz, st.hz);
  return sd < C.ADV_CLAMP ? sd : C.ADV_CLAMP;
}

// ---- placement ------------------------------------------------------------------

/**
 * Clearance of the level-flight hull centred at (x, y) from a posed station:
 * the least slack over the centre sphere and the four cross-section probes.
 * Non-negative means the hull test would pass at this position.
 */
export function hullClearance(st: Station, pose: AdvPose, x: number, y: number, z: number): number {
  let worst = stationSD(st, pose, x, y, z) - (C.HULL_CORE_R + C.HULL_TOLERANCE);
  for (let i = 0; i < HULL_PROBES.length; i += 3) {
    if (HULL_PROBES[i + 2] !== 0) continue; // nose and tail lie along z
    const d =
      stationSD(st, pose, x + HULL_PROBES[i]!, y + HULL_PROBES[i + 1]!, z) - C.HULL_TOLERANCE;
    if (d < worst) worst = d;
  }
  return worst;
}

/** Body extent from its centre in the cross-section (for the off-core rule and reach). */
function bodyRadius(shape: number, r: number, len: number): number {
  if (shape === SHAPE_RING) return len + r;
  if (shape === SHAPE_WEDGE) return len > r ? len : r;
  return Math.sqrt(len * len + r * r);
}

const decodeBlend = createBlend();

/**
 * Fills `out` for cell gz of segment seg; false when the cell is empty or the
 * station would be unfair (no room to keep the core clear before ADV_CORE_FROM).
 */
export function decodeStation(
  seed: number,
  mode: number,
  seg: number,
  gz: number,
  p: AdversaryParams,
  sp: Spine,
  out: Station,
): boolean {
  if (p.prob <= 0 || p.archetypes.length === 0) return false;
  const f = tableAt(ADVERSARY_FACTOR, seg);
  const prob = p.prob * f > 0.95 ? 0.95 : p.prob * f;
  if (unit01(hash2(gz, seg, seed ^ 0xad01)) > prob) return false;
  const z = (gz + 0.2 + 0.6 * unit01(hash2(gz, seg, seed ^ 0xad02))) * p.spacing;
  if (z < C.ADV_START || segmentAt(z).index !== seg) return false;
  let r = p.rMin + (p.rMax - p.rMin) * unit01(hash2(gz, seg, seed ^ 0xad03));
  const len = p.lenMin + (p.lenMax - p.lenMin) * unit01(hash2(gz, seg, seed ^ 0xad04));
  const arch = ARCHETYPES[p.archetypes[hash2(gz, seg, seed ^ 0xad05) % p.archetypes.length]!]!;
  const shape = arch[0];
  const motion = arch[1];
  const body = bodyRadius(shape, r, len);
  const reach = body + C.ADV_CLAMP;
  if (distanceToBoundary(z) < BLEND_LENGTH * 0.5 + reach) return false;
  spineAt(seed, z, sp, mode);
  const fp = blendAt(seed, z, decodeBlend, mode).params;
  const core = fp.coreRadius;
  // Margins follow the biome's own wall and floor noise (a noise-free trench needs almost none).
  const wallMargin = 1.5 * fp.warpAmp + fp.ridgeAmp + fp.detailAmp + 2;
  const floorMargin = 1.5 * fp.warpAmp + fp.floorNoiseAmp + fp.stalagmiteAmp + 4;
  const speed = tableAt(ADVERSARY_SPEED, seg);
  const basePeriod =
    p.periodMin +
    Math.floor((p.periodMax - p.periodMin + 1) * unit01(hash2(gz, seg, seed ^ 0xad06)));
  let period = Math.floor(basePeriod / speed);
  if (period < 1) period = 1;
  const halfX0 = sp.hw - r - wallMargin;
  const halfX = halfX0 > 0 ? halfX0 : 0;
  const yLo = sp.floorY + floorMargin + r;
  const yHi = sp.ceilY - C.CEIL_MARGIN - r;
  const halfY0 = (yHi - yLo) * 0.5;
  const halfY = halfY0 > 0 ? halfY0 : 0;
  let cx = sp.cx;
  let cy = motion === MOTION_SWEEP_Y ? (yLo + yHi) * 0.5 : sp.coreY;
  let ax = halfX * p.ampX;
  let ay = halfY * p.ampY;
  const keepCore = seg < C.ADV_CORE_FROM;
  const need = core + body + 2;
  if (shape === SHAPE_RING) {
    // The hole must clear the core; before ADV_CORE_FROM the hoop cannot drift.
    if (len - r < core + 2) return false;
    if (keepCore) ax = 0;
    // A drifting hoop's opening must still overlap the core by a full hull disc at
    // the end of its sweep: |offset| ≤ (opening − hull) + (core − hull) − 2.
    const reach = len - r - C.ADV_HULL_R + (core - C.ADV_HULL_R) - 2;
    if (ax > reach) ax = reach < 0 ? 0 : reach;
    ay = 0;
  } else if (motion === MOTION_ORBIT) {
    // Orbit around the core outside it: radius ≥ core + body + 2.
    if (need > halfX || need > halfY) return false;
    ax = need;
    ay = need;
  } else if (motion === MOTION_CLOSE) {
    // The jaws must open clearly wider than the minimum gap, or they are a wall.
    if (2 * halfX < p.gapMin + 8) return false;
    ax = 0;
    ay = 0;
  } else if (motion === MOTION_STATIC) {
    // A spinning blade never sits on the core: it would sweep the whole disc.
    if (halfX < need) return false;
    cx = sp.cx + (hash2(gz, seg, seed ^ 0xad08) & 1 ? need : -need);
    cy = sp.coreY;
    ay = 0;
  } else {
    // Sweeping and bouncing bodies: beside or above the core while there is room and the
    // segment asks for it; otherwise they cross the core (the free gap is always beside them),
    // except in the warm-up segment where they are simply skipped.
    let placed = false;
    if (keepCore) {
      if (motion === MOTION_SWEEP_Y && halfX >= need) {
        cx = sp.cx + (hash2(gz, seg, seed ^ 0xad08) & 1 ? need : -need);
        placed = true;
      } else if (motion !== MOTION_SWEEP_Y) {
        const up = sp.ceilY - C.CEIL_MARGIN - r - (sp.coreY + need);
        const down = sp.coreY - need - (sp.floorY + floorMargin + r);
        if (up >= 0 || down >= 0) {
          const goUp = down < 0 || (up >= 0 && (hash2(gz, seg, seed ^ 0xad09) & 1) === 1);
          cy = goUp ? sp.coreY + need : sp.coreY - need;
          ay = 0;
          placed = true;
        }
      }
    }
    if (!placed) {
      // Crossing the core: only a non-spinning body thin enough in y to leave a
      // 3 u lane for the hull above or below it (the hull is 8 u wide, under 3 u tall).
      if (seg === 0 || arch[2] !== 0) return false;
      const thin = core - 2 * C.ADV_HULL_RY - 3;
      if (thin < 1.5) return false;
      if (r > thin) r = thin;
      if (motion === MOTION_SWEEP_Y) {
        // A press: it dips into the core from the roomier side and always leaves a
        // 3 u lane on the far side, so ducking it is possible at every tick.
        const lane = 2 * C.ADV_HULL_RY + 3;
        const fromAbove = yHi - sp.coreY >= sp.coreY - yLo;
        const inner = sp.coreY + (fromAbove ? lane + r - core : core - lane - r);
        const outer = sp.coreY + (fromAbove ? core + 2 + r : -core - 2 - r);
        if (fromAbove ? outer > yHi : outer < yLo) return false;
        cy = (inner + outer) * 0.5;
        ay = (outer > inner ? outer - inner : inner - outer) * 0.5;
      }
    }
  }
  out.id = gz;
  out.seg = seg;
  out.z = z;
  out.shape = shape;
  out.motion = motion;
  out.spin = arch[2];
  out.cx = cx;
  out.cy = cy;
  out.ax = ax;
  out.ay = ay;
  out.r = r;
  out.len = len;
  out.hz = p.hz;
  out.period = period;
  out.phase = Math.floor(period * unit01(hash2(gz, seg, seed ^ 0xad07)));
  out.gapMin = p.gapMin;
  out.gapMax = 2 * halfX;
  out.closeDist = p.closeDist;
  out.core = core;
  out.reach = reach;
  return true;
}

/** Gathers every station with z in [z0, z1] into `out` (pure). Returns the count. */
export function gatherStations(
  seed: number,
  mode: number,
  z0: number,
  z1: number,
  out: Station[],
  sp: Spine = createSpine(),
): number {
  let n = 0;
  let seg = segmentAt(z0 < 0 ? 0 : z0);
  for (let guard = 0; guard < 6 && seg.start <= z1 && n < out.length; guard++) {
    const p = adversariesOf(biomeForSegment(seed, seg.index, mode));
    if (p.prob > 0 && p.archetypes.length > 0) {
      const s = p.spacing;
      const lo = z0 > seg.start ? z0 : seg.start;
      const hi = z1 < seg.end ? z1 : seg.end;
      const g0 = Math.floor(lo / s) - 1;
      const g1 = Math.floor(hi / s) + 1;
      for (let gz = g0; gz <= g1 && n < out.length; gz++) {
        const st = out[n]!;
        if (decodeStation(seed, mode, seg.index, gz, p, sp, st) && st.z >= z0 && st.z <= z1) n++;
      }
    }
    if (!Number.isFinite(seg.end)) break;
    seg = segmentAt(seg.end + 1);
  }
  return n;
}

/** Per-seed scratch: the active station pool around the plane and this tick's poses. */
export class AdversaryScratch {
  readonly seed: number;
  readonly mode: number;
  readonly stations: Station[] = [];
  readonly poses: AdvPose[] = [];
  count = 0;
  readonly near = new Int32Array(ADV_MAX);
  nearCount = 0;
  private slab = Number.NaN;
  private readonly spine = createSpine();
  readonly probe = new Float64Array(3);

  constructor(seed: number, mode = 0) {
    this.seed = seed >>> 0;
    this.mode = mode;
    for (let i = 0; i < ADV_MAX; i++) {
      this.stations.push(createStation());
      this.poses.push(createPose());
    }
  }

  /** Regathers the window when the plane changes slab (quantised so results never depend on history). */
  activate(z: number): void {
    const slab = Math.floor(z / CHUNK_SIZE);
    if (slab === this.slab) return;
    this.slab = slab;
    const mid = (slab + 0.5) * CHUNK_SIZE;
    this.count = gatherStations(
      this.seed,
      this.mode,
      mid - C.ADV_WINDOW,
      mid + C.ADV_WINDOW,
      this.stations,
      this.spine,
    );
    this.nearCount = 0;
  }

  /** Poses for every active station at `time`; fills the near list for the hull's z sweep. */
  posesAt(time: number, planeZ: number, zLo: number, zHi: number): void {
    this.nearCount = 0;
    for (let i = 0; i < this.count; i++) {
      const st = this.stations[i]!;
      if (st.z + st.hz + C.ADV_NEAR_BAND < zLo || st.z - st.hz - C.ADV_NEAR_BAND > zHi) continue;
      advPoseAt(st, time, planeZ, this.poses[i]!);
      this.near[this.nearCount++] = i;
    }
  }

  /** Nearest adversary distance at a point over the near list (inside < 0), clamped. */
  distance(x: number, y: number, z: number): number {
    let best: number = C.ADV_CLAMP;
    for (let k = 0; k < this.nearCount; k++) {
      const i = this.near[k]!;
      const sd = stationSD(this.stations[i]!, this.poses[i]!, x, y, z);
      if (sd < best) best = sd;
    }
    return best;
  }

  /** Hull vs adversaries at one pose: centre sphere plus the six probes. */
  hullHits(
    x: number,
    y: number,
    z: number,
    qx: number,
    qy: number,
    qz: number,
    qw: number,
  ): boolean {
    if (this.nearCount === 0) return false;
    if (this.distance(x, y, z) < C.HULL_CORE_R + C.HULL_TOLERANCE) return true;
    const p = this.probe;
    for (let i = 0; i < HULL_PROBES.length; i += 3) {
      rotate(qx, qy, qz, qw, HULL_PROBES[i]!, HULL_PROBES[i + 1]!, HULL_PROBES[i + 2]!, p, 0);
      if (this.distance(x + p[0]!, y + p[1]!, z + p[2]!) < C.HULL_TOLERANCE) return true;
    }
    return false;
  }

  /** Index of the station whose plane the hull centre crosses in [z0, z1], or -1. */
  crossing(z0: number, z1: number): number {
    if (z0 === z1) return -1;
    for (let k = 0; k < this.nearCount; k++) {
      const i = this.near[k]!;
      const sz = this.stations[i]!.z;
      if ((z0 - sz) * (z1 - sz) <= 0) return i;
    }
    return -1;
  }
}
