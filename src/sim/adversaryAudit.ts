// Fairness audit for adversary stations (ADR 0007 §5): a hull-sized free disc
// must exist inside the core at every tick of a station's period, must be
// reachable under a lateral speed bound, and no body may move faster than the
// cap. Pure and allocation-light so tests and the CLI tool share it.
import {
  advPoseAt,
  createAim,
  createPose,
  gatherStations,
  hullClearance,
  createStation,
  MOTION_AIM,
} from './adversaries.ts';
import type { Station } from './adversaries.ts';
import { C } from './constants.ts';
import { spineAt } from '../terrain/field.ts';

export interface StationVerdict {
  id: number;
  seg: number;
  z: number;
  shape: number;
  motion: number;
  ok: boolean;
  reason: string;
  worstFreeCells: number;
  maxStep: number;
}

export interface AuditResult {
  seed: number;
  mode: number;
  stations: number;
  failures: StationVerdict[];
  worst: StationVerdict | null;
}

const CELL = 1; // u; lattice spacing inside the core disc
/** Lateral speed bound for the reachable corridor, u per tick (60 u/s). */
const LAT = 1.0;

/** Audits one station: returns the verdict. */
export function auditStation(seed: number, mode: number, st: Station): StationVerdict {
  const verdict: StationVerdict = {
    id: st.id,
    seg: st.seg,
    z: st.z,
    shape: st.shape,
    motion: st.motion,
    ok: true,
    reason: '',
    worstFreeCells: Infinity,
    maxStep: 0,
  };
  const sp = spineAt(seed, st.z, undefined, mode);
  // Hull centres must keep the whole level hull inside the core: an ellipse of centres.
  const reachX = st.core - C.ADV_HULL_R;
  const reachY = st.core - C.ADV_HULL_RY;
  const reach = reachX;
  if (reach <= 0) {
    verdict.ok = false;
    verdict.reason = 'core too small for the hull';
    return verdict;
  }
  // Lattice of candidate centres inside the core disc.
  const n = Math.floor((2 * reachY) / CELL) + 1;
  const cellsX: number[] = [];
  const cellsY: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = -reachY + i * CELL;
      const y = -reachY + j * CELL;
      if ((x * x) / (reachX * reachX) + (y * y) / (reachY * reachY) <= 1) {
        cellsX.push(sp.cx + x);
        cellsY.push(sp.coreY + y);
      }
    }
  }
  const count = cellsX.length;
  if (st.motion === MOTION_AIM) {
    // Static after the lock: for every lock position inside the core a clear hull
    // position must exist within reach of the plane before it arrives.
    const pose = createPose();
    const aim = createAim();
    aim.lockId = st.id;
    const ticks = st.closeDist / (C.MAX_SPEED * C.DT);
    const budget = ticks * LAT;
    for (let a = -st.ax; a <= st.ax + 1e-9; a += 2) {
      for (let b = -st.ay; b <= st.ay + 1e-9; b += 2) {
        aim.lockX = sp.cx + a;
        aim.lockY = sp.coreY + b;
        advPoseAt(st, 0, st.z, pose, aim);
        let nearest = Infinity;
        let freeCount = 0;
        for (let k = 0; k < count; k++) {
          if (hullClearance(st, pose, cellsX[k]!, cellsY[k]!, st.z) < 0) continue;
          freeCount++;
          const dx = cellsX[k]! - aim.lockX;
          const dy = cellsY[k]! - aim.lockY;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < nearest) nearest = d;
        }
        if (freeCount < verdict.worstFreeCells) verdict.worstFreeCells = freeCount;
        if (freeCount === 0 || nearest > budget) {
          verdict.ok = false;
          verdict.reason =
            freeCount === 0
              ? `lock at ${a.toFixed(0)},${b.toFixed(0)}: no clear hull position`
              : `lock at ${a.toFixed(0)},${b.toFixed(0)}: nearest clear position ${nearest.toFixed(1)} u away, budget ${budget.toFixed(1)}`;
          return verdict;
        }
      }
    }
    return verdict;
  }
  const period = st.period;
  // Free sets per tick over one period (plus the approach for CLOSE laws).
  const pose = createPose();
  const free: Uint8Array[] = [];
  let prevX = 0;
  let prevY = 0;
  let prevR = 0;
  for (let t = 0; t < period; t++) {
    // CLOSE: the plane at closeDist*(1 - t/period) ... audit at the tightest gap (plane at the station).
    advPoseAt(st, t, st.z, pose);
    if (t > 0) {
      // A ring edge that breathes moves as fast as its radius changes.
      const dr = pose.radius - prevR;
      const step = Math.sqrt(
        (pose.x - prevX) * (pose.x - prevX) + (pose.y - prevY) * (pose.y - prevY) + dr * dr,
      );
      if (step > verdict.maxStep) verdict.maxStep = step;
    }
    prevX = pose.x;
    prevY = pose.y;
    prevR = pose.radius;
    const f = new Uint8Array(count);
    let freeCount = 0;
    for (let k = 0; k < count; k++) {
      if (hullClearance(st, pose, cellsX[k]!, cellsY[k]!, st.z) >= 0) {
        f[k] = 1;
        freeCount++;
      }
    }
    if (freeCount < verdict.worstFreeCells) verdict.worstFreeCells = freeCount;
    free.push(f);
  }
  if (verdict.maxStep > C.ADV_MAX_STEP + 1e-9) {
    verdict.ok = false;
    verdict.reason = `moves ${verdict.maxStep.toFixed(2)} u per tick`;
    return verdict;
  }
  // The two collision sub-steps are 1.67 u apart along z: bodies must be at least 2 u deep.
  if (2 * st.hz < 2 - 1e-9) {
    verdict.ok = false;
    verdict.reason = `body only ${(2 * st.hz).toFixed(1)} u deep along z`;
    return verdict;
  }
  if (verdict.worstFreeCells === 0) {
    verdict.ok = false;
    verdict.reason = 'no free hull position at some tick';
    return verdict;
  }
  // Reachable corridor: R(t+1) = F(t+1) ∩ dilate(R(t), LAT), from every start phase, over two periods.
  const dil = Math.ceil(LAT / CELL);
  const neighbours: number[][] = [];
  for (let k = 0; k < count; k++) {
    const list: number[] = [];
    for (let m = 0; m < count; m++) {
      const dx = cellsX[m]! - cellsX[k]!;
      const dy = cellsY[m]! - cellsY[k]!;
      if (dx * dx + dy * dy <= dil * CELL * (dil * CELL) + 1e-9) list.push(m);
    }
    neighbours.push(list);
  }
  let cur = new Uint8Array(count);
  let next = new Uint8Array(count);
  for (let start = 0; start < period; start += Math.max(1, Math.floor(period / 12))) {
    cur.set(free[start]!);
    for (let step = 1; step <= 2 * period; step++) {
      const f = free[(start + step) % period]!;
      next.fill(0);
      let any = 0;
      for (let k = 0; k < count; k++) {
        if (!cur[k]) continue;
        for (const m of neighbours[k]!) if (f[m]) next[m] = 1;
      }
      for (let k = 0; k < count; k++) any += next[k]!;
      if (any === 0) {
        verdict.ok = false;
        verdict.reason = `free hull position unreachable from phase ${start} after ${step} ticks`;
        return verdict;
      }
      const tmp = cur;
      cur = next;
      next = tmp;
    }
  }
  return verdict;
}

/** Audits every station of a world between z0 and z1. */
export function auditWorld(
  seed: number,
  mode: number,
  z0: number,
  z1: number,
  maxStations = 512,
): AuditResult {
  const pool = Array.from({ length: maxStations }, createStation);
  const n = gatherStations(seed, mode, z0, z1, pool);
  const failures: StationVerdict[] = [];
  let worst: StationVerdict | null = null;
  for (let i = 0; i < n; i++) {
    const v = auditStation(seed, mode, pool[i]!);
    if (!v.ok) failures.push(v);
    if (!worst || v.worstFreeCells < worst.worstFreeCells) worst = v;
  }
  return { seed, mode, stations: n, failures, worst };
}
