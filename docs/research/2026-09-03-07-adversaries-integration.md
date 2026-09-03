# 07 — Moving adversaries: integration with the deterministic sim and renderer

Engineering design for the owner request "adversaries that fit each biome and
move only in the cross-section plane (x/y) at their z station, never forward or
backward". Concepts (what each biome's adversaries look like and how they
behave) come from the concept doc (`06-adversaries-design.md`); this document
fixes the machinery they plug into. Everything below was checked against the
code as of today (SIM_VERSION 0.1.8, `src/sim/step.ts`, `src/terrain/features.ts`,
`src/app/game.ts`, `src/render/renderer.ts`).

## 0. Decision in one paragraph

Adversaries are **stations**: hashed z cells per biome, exactly like arches and
tunnels, but they never enter the density field. Each station carries a
**closed-form motion law** `pose(seed, station, time, planeZ)` built only from
`+ - * / floor abs sqrt min max` and a literal (cos, sin) table, so the sim
evaluates it at integer ticks and the renderer at `tick + alpha` from the same
function, bit-identically at every integer tick. The sim tests the hull against
**analytic SDFs** of the bodies at the tick's end (plus a z-crossing sub-step),
folds the adversary distance into the existing `near` / proximity / THREADED
machinery, and adds one stateless event, DODGED. `SimState` gains nothing in
v1; the marching-cubes worker, chunk cache and shell skip are untouched. The
renderer draws bodies as `InstancedMesh` per shape from the same pose function,
with an unlit "core" instance for the telegraph and a bar frame at the station z.
A Node audit proves, for seeds 1–8 over 10 000 u, that a hull-sized free disc
inside the core tube exists at every tick of every station's period **and** is
reachable under a lateral speed bound, and the scripted pilot gains a lateral
offset planner so goldens and headless runs fly through stations.

Measured on this VM (Node 24, `scratchpad/bench-*.ts`):

| Quantity | Value |
|---|---|
| Full sim tick (pilot, full throttle) | 110–122 µs |
| One field `density()` evaluation | ≈ 4.6 µs (≈ 15 per tick: 12 hull probes + 3 distance probes) |
| One analytic capsule SDF | ≈ 6 ns |
| `spineAt(seed, z)` (blend + difficulty + param copy) | ≈ 6.2 µs, so it is cached per station at gather time, never per tick |
| `hash1 + unit01` | ≈ 2.5 ns |
| 32-entry (cos, sin) table, lerp + renormalise | max angle error 0.007°, radial error before normalising 4.8e-3 |

## 1. Placement and motion

### 1.1 Stations are hashed z cells per biome

Like arches (`features.ts` lines 393–408): one lattice of spacing `s` along z
per segment, one hash roll per cell, the cell's hashes give every parameter.
A station is a pure function of `(seed, segmentIndex, gz)`.

Rules that keep them fair and single-biome:

- No station with `z < C.ADV_START` (600 u: the first hub is a warm-up).
- No station within `BLEND_LENGTH / 2 + reach` of a segment boundary. Blends
  lerp two spines; excluding the blend zone means `spineAt(seed, z)` at a
  station is the pure, difficulty-scaled spine of one biome, so the station's
  lane geometry is single-biome by construction. The gate's clear zone (75 u)
  is inside this anyway.
- The station's rest centre is the corridor core `(sp.cx, sp.coreY)` at its z:
  the guaranteed-air tube is where the player must be able to fly, so that is
  where the threat lives.
- Per-segment difficulty scales probability and speed from literal tables in
  `difficulty.ts`, like everything else.

### 1.2 Parameters live on the biome

`BiomeDef` already carries render-only data (atmosphere, palette), so the
adversary set belongs there too; `src/terrain/params.ts` gets the type and
`src/terrain/biomes/*.ts` the values. The sim reads it through
`biomeForSegment(seed, index).adversaries` (the `sim → terrain` direction is
allowed by spec §3).

```ts
// src/terrain/params.ts (addition)
/** Adversary stations for a biome. prob 0 disables. Sizes in u, periods in ticks. */
export interface AdversaryParams {
  spacing: number; // z lattice spacing (u), e.g. 140
  prob: number; // per cell, before the difficulty factor
  /** Archetype ids (src/sim/adversaries.ts ARCHETYPES) picked uniformly by hash. */
  archetypes: readonly number[];
  rMin: number; // body half-thickness / radius
  rMax: number;
  lenMin: number; // blade half-length or ring radius
  lenMax: number;
  hz: number; // half depth along z (≥ 1)
  periodMin: number; // integer ticks, before the difficulty divisor
  periodMax: number;
  /** Fractions [0, 1] of the free lateral / vertical span used as amplitude. */
  ampX: number;
  ampY: number;
  /** CLOSE motion: gap shrinks from the free width to gapMin over closeDist u of approach. */
  gapMin: number;
  closeDist: number;
}

export interface BiomeDef {
  /* …existing… */
  adversaries: AdversaryParams;
}

export const NO_ADVERSARIES: AdversaryParams = Object.freeze({ spacing: 100, prob: 0, archetypes: [], /* zeros */ });
```

```ts
// src/terrain/difficulty.ts (addition; literal tables, indexed by segment like the others)
export const ADVERSARY_FACTOR = [0.5, 0.65, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5]; // probability ×
export const ADVERSARY_SPEED = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6]; // period ÷
```

### 1.3 Shapes × motions, not a zoo of kinds

The concept doc will name things ("mine", "gate", "ribbon"…). The engine only
knows four **shapes** (2D profile in the cross-section, extruded `±hz` along z)
and six **translation laws** plus an optional **spin**, combined into
archetypes by a literal table. Every concept maps to one row; new rows are one
line and no new code paths.

```ts
// src/sim/adversaries.ts
export const SHAPE_BOX = 0; // rounded box, half extents (len, r)
export const SHAPE_WEDGE = 1; // isosceles triangle prism, apex up, half base len, height 2r
export const SHAPE_RING = 2; // annulus, radius len, tube r (a hole to fly through)
export const SHAPE_BLADE = 3; // long thin box, half-length len, half-thickness r (rotates)

export const MOTION_STATIC = 0;
export const MOTION_SWEEP_X = 1; // smooth pendulum across the corridor
export const MOTION_SWEEP_Y = 2; // smooth pendulum floor ↔ ceiling
export const MOTION_BOUNCE_X = 3; // constant speed, hard reversal at the lane edges
export const MOTION_ORBIT = 4; // centre on an ellipse (ampX, ampY) around the core
export const MOTION_CLOSE = 5; // two mirrored bodies whose gap closes as the plane approaches

/** Archetype rows: [shape, motion, spinTurnsPerPeriod]. Ids are stable (hashed replays depend on them). */
export const ARCHETYPES: readonly (readonly [number, number, number])[] = [
  [SHAPE_BLADE, MOTION_STATIC, 1], // 0 spinning blade
  [SHAPE_BOX, MOTION_BOUNCE_X, 0], // 1 bouncing block
  [SHAPE_BOX, MOTION_SWEEP_Y, 0], // 2 piston
  [SHAPE_RING, MOTION_SWEEP_X, 0], // 3 drifting hoop (fly through it)
  [SHAPE_WEDGE, MOTION_ORBIT, 0], // 4 orbiting shard
  [SHAPE_BOX, MOTION_CLOSE, 0], // 5 closing jaws
  [SHAPE_BLADE, MOTION_SWEEP_X, 1], // 6 sweeping, spinning blade
];
```

### 1.4 Station record and decode

```ts
export interface Station {
  id: number; // gz cell (int32)
  seg: number; // segment index
  z: number;
  shape: number;
  motion: number;
  spin: number; // turns per period (integer)
  cx: number; // rest centre = core at z
  cy: number;
  ax: number; // amplitude x (u), already clamped to the lane
  ay: number; // amplitude y (u)
  r: number; // half-thickness / tube radius
  len: number; // half-length / ring radius
  hz: number; // half depth along z
  period: number; // integer ticks ≥ 1
  phase: number; // integer ticks in [0, period)
  gapMin: number; // CLOSE only
  gapMax: number; // CLOSE only: full free width
  closeDist: number; // CLOSE only
  core: number; // coreRadius at z (for the audit and the pilot)
  reach: number; // axis-aligned bound in the cross-section, for early-outs
}

/** Fills `out` for cell gz of segment seg; returns false when the cell is empty. */
export function decodeStation(seed: number, seg: number, gz: number, p: AdversaryParams, sp: Spine, out: Station): boolean {
  const f = tableAt(ADVERSARY_FACTOR, seg);
  if (unit01(hash2(gz, seg, seed ^ 0xad01)) > (p.prob * f > 0.95 ? 0.95 : p.prob * f)) return false;
  const z = (gz + 0.2 + 0.6 * unit01(hash2(gz, seg, seed ^ 0xad02))) * p.spacing;
  if (z < C.ADV_START || segmentAt(z).index !== seg) return false;
  const r = p.rMin + (p.rMax - p.rMin) * unit01(hash2(gz, seg, seed ^ 0xad03));
  const len = p.lenMin + (p.lenMax - p.lenMin) * unit01(hash2(gz, seg, seed ^ 0xad04));
  const reach = (len > r ? len : r) + C.ADV_CLAMP;
  if (distanceToBoundary(z) < BLEND_LENGTH * 0.5 + reach) return false;
  spineAt(seed, z, sp); // pure spine of this segment (outside every blend zone)
  const arch = ARCHETYPES[p.archetypes[hash2(gz, seg, seed ^ 0xad05) % p.archetypes.length]!]!;
  const speed = tableAt(ADVERSARY_SPEED, seg);
  const basePeriod = p.periodMin + Math.floor((p.periodMax - p.periodMin + 1) * unit01(hash2(gz, seg, seed ^ 0xad06)));
  const period = Math.max(1, Math.floor(basePeriod / speed));
  // Free spans: walls are noisy by up to ±16 u (docs/domain/terrain-field.md), so keep that margin.
  const halfX = Math.max(0, sp.hw - r - C.ADV_WALL_MARGIN);
  const yLo = sp.floorY + C.ADV_FLOOR_MARGIN + r;
  const yHi = sp.ceilY - C.CEIL_MARGIN - r;
  const halfY = Math.max(0, (yHi - yLo) * 0.5);
  out.id = gz; out.seg = seg; out.z = z;
  out.shape = arch[0]; out.motion = arch[1]; out.spin = arch[2];
  out.cx = sp.cx;
  out.cy = out.motion === MOTION_SWEEP_Y ? (yLo + yHi) * 0.5 : sp.coreY;
  out.ax = halfX * p.ampX;
  out.ay = halfY * p.ampY;
  out.r = r; out.len = len; out.hz = p.hz;
  out.period = period;
  out.phase = Math.floor(period * unit01(hash2(gz, seg, seed ^ 0xad07)));
  out.gapMin = p.gapMin; out.gapMax = 2 * halfX; out.closeDist = p.closeDist;
  out.core = coreRadiusAt(seed, z); // blendAt(seed, z).params.coreRadius, cached like the spine
  out.reach = reach;
  return true;
}
```

Hashes are `hash2(gz, seg, seed ^ salt)` so adjacent segments that happen to
share a spacing do not correlate, and the salts `0xad01…` are new (feature
salts are `0x5xxx…0xfxxx`).

### 1.5 Closed-form motion (no trig, exact at integer ticks)

```ts
/** Fraction of the period in [0, 1). Exact for integer time; the renderer passes tick + alpha. */
export function phase01(time: number, period: number, phase: number): number {
  const u = (time + phase) / period;
  return u - Math.floor(u);
}
/** Triangle wave: −1 at u = 0, +1 at u = 0.5, −1 at u = 1. Constant speed, hard reversals. */
export function tri(u: number): number {
  return 1 - Math.abs(4 * u - 2);
}
/** Smooth pendulum: the triangle eased by the cubic smoothstep. Zero velocity at the ends, peak 1.5× the triangle. */
export function swing(u: number): number {
  const t = 0.5 + 0.5 * tri(u);
  return 2 * t * t * (3 - 2 * t) - 1;
}

/** 32 literal (cos, sin) pairs; lerp between neighbours, then renormalise (angle error 0.007°). */
const CIRCLE = new Float64Array([1, 0, 0.98079, 0.19509, 0.92388, 0.38268, /* … 32 pairs … */]);
/** Unit vector at turn fraction u ∈ [0, 1): out[o] = cos, out[o + 1] = sin. */
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

export interface AdvPose {
  x: number; // body centre (CLOSE: the +x body; the −x body mirrors about cx)
  y: number;
  c: number; // body rotation (cos, sin) about z
  s: number;
  gap: number; // CLOSE: half gap; unused otherwise
}

/** Pose at `time` (ticks, may be fractional) with the plane at planeZ (for approach-driven laws). */
export function advPoseAt(st: Station, time: number, planeZ: number, out: AdvPose): void {
  const u = phase01(time, st.period, st.phase);
  let x = st.cx;
  let y = st.cy;
  out.gap = 0;
  switch (st.motion) {
    case MOTION_SWEEP_X: x += st.ax * swing(u); break;
    case MOTION_SWEEP_Y: y += st.ay * swing(u); break;
    case MOTION_BOUNCE_X: x += st.ax * tri(u); break;
    case MOTION_ORBIT: circle(u, tmp2, 0); x += st.ax * tmp2[0]!; y += st.ay * tmp2[1]!; break;
    case MOTION_CLOSE: {
      const dz = st.z - planeZ; // > 0 while approaching
      const k = smoothstep(0, st.closeDist, dz); // 1 far away, 0 at the station
      out.gap = 0.5 * (st.gapMin + (st.gapMax - st.gapMin) * k);
      x += out.gap + st.len; // the +x body; the SDF mirrors it
      break;
    }
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
```

`MOTION_CLOSE` is the "reactive" adversary made stateless: its pose is a
function of the plane's z, not of history. That covers "closes as you approach"
without a trigger tick in the state. Only a latched behaviour ("once triggered,
stays shut") needs state; see §2.

Speed bound (checked by the audit, §6): the fastest law is `swing`, peak
`6·A / period` u per tick; `tri` is `4·A / period`; orbit is `2π·A / period`;
a spinning blade tip is `2π·len·spin / period`. All must stay under
`C.ADV_MAX_STEP = 1.5` u per tick (90 u/s), which the audit asserts per station.

### 1.6 Signed distance of a station

```ts
/** Extrudes a 2D signed distance d2 by ±hz along z (exact SDF of the prism). */
function extrude(d2: number, dz: number, hz: number): number {
  const wz = Math.abs(dz) - hz;
  const ox = d2 > 0 ? d2 : 0;
  const oz = wz > 0 ? wz : 0;
  const inside = d2 > wz ? d2 : wz;
  return Math.sqrt(ox * ox + oz * oz) + (inside < 0 ? inside : 0);
}

/** Signed distance from (x, y, z) to the station's body at pose p (negative inside). */
export function stationSD(st: Station, p: AdvPose, x: number, y: number, z: number): number {
  const dz = z - st.z;
  if (dz > st.reach || dz < -st.reach) return C.ADV_CLAMP;
  let dx = x - p.x;
  let dy = y - p.y;
  if (st.motion === MOTION_CLOSE) dx = Math.abs(x - st.cx) - (p.gap + st.len); // mirror pair
  // Into the body frame (rotation about z by −θ).
  const bx = p.c * dx + p.s * dy;
  const by = -p.s * dx + p.c * dy;
  let d2: number;
  if (st.shape === SHAPE_RING) {
    d2 = Math.abs(Math.sqrt(bx * bx + by * by) - st.len) - st.r;
  } else if (st.shape === SHAPE_WEDGE) {
    d2 = triangleSD(bx, by, st.len, 2 * st.r); // Quilez sdTriangleIsosceles: abs, sqrt, clamp only
  } else {
    // BOX and BLADE: rounded box, half extents (len, r), rounding 0.5.
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
```

`min` over stations is order-independent and exact, so gather order never
changes a result, the same argument `featuresSD` relies on.

### 1.7 Files and hooks

| File | Change |
|---|---|
| `src/terrain/params.ts` | `AdversaryParams`, `NO_ADVERSARIES`; `BiomeDef.adversaries` in `biomes.ts` |
| `src/terrain/difficulty.ts` | `ADVERSARY_FACTOR`, `ADVERSARY_SPEED` tables |
| `src/terrain/biomes/*.ts` | one `adversaries:` block per biome (values from the concept doc) |
| `src/sim/adversaries.ts` (new) | constants, `Station`, `AdvPose`, `phase01/tri/swing/circle`, `decodeStation`, `gatherStations`, `AdversaryScratch`, `activeStations`, `advPosesAt`, `stationSD`, `adversariesSD`, `advHullHits`, `advCrossing` |
| `src/sim/constants.ts` | `ADV_*`, `HULL_CORE_R`, `DODGE_DIST`, `DODGE_BONUS` (hashed) |
| `src/sim/step.ts` | 12 lines in the collision / near-miss section (§4) |
| `src/sim/collision.ts` | no change; `advHullHits` reuses `HULL_PROBES`, `HULL_REACH` and `cs.probe` |
| `src/sim/pilot.ts` | `dodge` option (default on), lateral offset planner (§6) |
| `src/render/adversaries.ts` (new) | `Adversaries` class: instanced bodies, cores, frames (§5) |
| `src/render/renderer.ts` | `setAdversaries(...)` on `GameRenderer`; `NullRenderer` no-op |
| `src/app/game.ts` | `render()` passes the scratch's stations and `pose.time / pose.z` to the renderer; `snapshot()` adds counts |
| `src/app/hud.ts` | `EVENT_NAMES[5] = 'dodged'` |
| `tools/adversary-audit.ts` (new) | fairness audit (§6) |
| `docs/adr/2026-09-03-0007-analytic-adversaries-outside-the-field.md`, `docs/domain/adversaries.md`, `docs/specs/2026-09-03-CR-0031-adversaries.md` | decision, domain, spec |

## 2. State, replay and versioning

**Nothing new in `SimState` for v1.** Every pose is `f(seed, station, tick,
planeZ)`; the tick and the plane's z are already hashed. Adversary effects
reach the checksum through `alive`, `proximity` (hashed, and it now includes
the adversary distance) and `score` (DODGED points). `eventId/eventTick/
eventPoints` are not in `checksum()` today either (only `score` is), so DODGED
is covered exactly as CLOSE is.

**If the concept doc needs a latched trigger** ("the jaws snap shut when you
pass z − 120 and stay shut"), add a fixed slot array, hashed and copied:

```ts
// state.ts (only if a latched archetype ships)
export const ADV_SLOTS = 8;
interface SimState { /* … */ adv: Int32Array; /* ADV_SLOTS × [stationId, triggerTick]; −1 = free */ }
createState: adv: new Int32Array(ADV_SLOTS * 2).fill(-1)
cloneState:  adv: Int32Array.from(s.adv)
copyState:   dst.adv.set(src.adv)
checksum:    u32s: [tick, alive, rng[0..3], ...adv]   // append after the PRNG words
```

Slot discipline: a slot is claimed the tick the trigger condition first holds
(`stationId` = `gz`, `triggerTick` = `s.tick`), searched linearly (8 entries),
and released when the station leaves the active window behind the plane.
Deterministic because the claim order is the enumeration order, which is a pure
function of z. The pose then takes `latchedAt` as a third time base. This is a
`SIM_VERSION` bump plus a replay-format-neutral change (the JSON format does
not carry state, only checkpoints). Recommendation: do not ship it in v1;
`MOTION_CLOSE` gives the reactive feel statelessly.

**Versioning, concretely:**

- New entries in `C` change `constantsHash` → every existing replay reports
  `version-mismatch` by design. Goldens must be regenerated in the same commit
  with `pnpm sim:regold` (bumps `SIM_VERSION` 0.1.8 → 0.1.9, refuses on a dirty
  tree).
- Goldens are 1800-tick pilot runs reaching z ≈ 3 000–4 000 u, so they cross
  stations from z ≥ 600 and become the regression test for adversary
  determinism; `tests/e2e/cross-engine.spec.ts` then proves Chromium agrees
  with Node on adversary ticks too.
- The goldens are recorded by `createPilot`; enabling the dodge planner
  changes them. Land the planner in the same story as the constants so there is
  one bump, not two.
- Adversary parameters on biomes are not hashed (same policy as
  `FieldParams`): a tuning change shows up as failing goldens and a deliberate
  regold, which is the visibility the working agreements want.

## 3. Active window, enumeration, and how the renderer learns

Active window: `z ∈ [planeZ − ADV_WINDOW, planeZ + ADV_WINDOW]`, `ADV_WINDOW = 700`
(fog is ~98 % at 640 u, so nothing pops in visibly). Physics only ever looks
at the near band `|z − st.z| ≤ ADV_NEAR_BAND = PROXIMITY_RANGE + HULL_REACH + 4 = 37`,
so the window size cannot influence a checksum: it exists for the renderer.

```ts
export const ADV_MAX = 32; // ≥ 1400 u / smallest spacing (100) + 3 segments' worth of edge cells

export class AdversaryScratch {
  readonly stations: Station[] = Array.from({ length: ADV_MAX }, createStation);
  readonly poses: AdvPose[] = Array.from({ length: ADV_MAX }, createPose);
  count = 0;
  /** Stations whose z band can touch the hull this tick (typically 0 or 1). */
  readonly near = new Int32Array(ADV_MAX);
  nearCount = 0;
  private slab = Number.NaN;
  private readonly spine = createSpine();
  constructor(readonly seed: number) {}
}

/** Gathers every station with z in [z0, z1] into `out` (pure; the audit and tools call this directly). */
export function gatherStations(seed: number, z0: number, z1: number, out: Station[], sp: Spine): number {
  let n = 0;
  let seg = segmentAt(z0);
  for (let guard = 0; guard < 4 && seg.start <= z1; guard++) {
    const p = biomeForSegment(seed, seg.index).adversaries;
    if (p.prob > 0) {
      const s = p.spacing;
      const g0 = Math.floor(Math.max(z0, seg.start) / s);
      const g1 = Math.floor(Math.min(z1, seg.end) / s);
      for (let gz = g0; gz <= g1 && n < out.length; gz++)
        if (decodeStation(seed, seg.index, gz, p, sp, out[n]!)) n++;
    }
    seg = segmentAt(seg.end + 1);
  }
  return n;
}

/** Cached gather around the plane: re-runs only when the plane changes slab (64 u). */
export function activeStations(adv: AdversaryScratch, z: number): void {
  const slab = Math.floor(z / CHUNK_SIZE);
  if (slab === adv.slab) return;
  adv.slab = slab;
  const mid = (slab + 0.5) * CHUNK_SIZE;
  adv.count = gatherStations(adv.seed, mid - C.ADV_WINDOW, mid + C.ADV_WINDOW, adv.stations, adv.spine);
}
```

No allocation: the pool is filled in place, `Station` objects are reused, the
window centre is quantised to the slab so a cold scratch and a warm one produce
the same set (the sim's results cannot depend on the cache history because
physics never reaches the window edge). Cost per regather: ≈ 12 cells × 2.5 ns
plus ≈ 5 decoded stations × 6.2 µs (`spineAt`) ≈ 35 µs, once per 64 u.

**The renderer needs no worker and no second enumeration.** The sim already
runs on the main thread (`Game.tick` → `step`), and `StepScratch` will own an
`AdversaryScratch`. `Game.render` hands the renderer the scratch's station
list together with `pose.time` and `pose.z`; the renderer computes its own poses
at the fractional time into its own `AdvPose` pool. Before the first tick
(attract mode) `render()` calls `activeStations` itself; it is idempotent.

## 4. Collision and near misses

### 4.1 Per tick, in `step.ts`

Poses are evaluated **once per tick at the tick's end** (`s.tick + 1` inside
`step`, which is `state.tick` after it, i.e. `pose.time` at `alpha = 1`), and
the near list is built for the z range swept this tick.

```ts
/** Poses for every active station at `time`; fills the near list for the hull's z sweep [zLo, zHi]. */
export function advPosesAt(adv: AdversaryScratch, time: number, planeZ: number, zLo: number, zHi: number): void {
  adv.nearCount = 0;
  for (let i = 0; i < adv.count; i++) {
    const st = adv.stations[i]!;
    if (st.z + st.hz + C.ADV_NEAR_BAND < zLo || st.z - st.hz - C.ADV_NEAR_BAND > zHi) continue;
    advPoseAt(st, time, planeZ, adv.poses[i]!);
    adv.near[adv.nearCount++] = i;
  }
}

/** Nearest adversary distance at a point over the near list (clamped like FEATURE_CLAMP). */
export function adversariesSD(adv: AdversaryScratch, x: number, y: number, z: number): number {
  let best = C.ADV_CLAMP;
  for (let k = 0; k < adv.nearCount; k++) {
    const i = adv.near[k]!;
    const sd = stationSD(adv.stations[i]!, adv.poses[i]!, x, y, z);
    if (sd < best) best = sd;
  }
  return best;
}

/** Hull vs adversaries at one pose: a centre sphere (thin bodies cannot slip between probes) plus the six probes. */
export function advHullHits(adv: AdversaryScratch, x: number, y: number, z: number, qx: number, qy: number, qz: number, qw: number, probe: Float64Array): boolean {
  if (adv.nearCount === 0) return false;
  if (adversariesSD(adv, x, y, z) < C.HULL_CORE_R + C.HULL_TOLERANCE) return true;
  for (let i = 0; i < HULL_PROBES.length; i += 3) {
    rotate(qx, qy, qz, qw, HULL_PROBES[i]!, HULL_PROBES[i + 1]!, HULL_PROBES[i + 2]!, probe, 0);
    if (adversariesSD(adv, x + probe[0]!, y + probe[1]!, z + probe[2]!) < C.HULL_TOLERANCE) return true;
  }
  return false;
}

/** Index of the station whose plane the hull centre crosses this tick, or −1 (stations are ≥ 0.6·spacing apart, so at most one). */
export function advCrossing(adv: AdversaryScratch, z0: number, z1: number): number {
  if (z0 === z1) return -1;
  for (let k = 0; k < adv.nearCount; k++) {
    const i = adv.near[k]!;
    const sz = adv.stations[i]!.z;
    if ((z0 - sz) * (z1 - sz) <= 0) return i;
  }
  return -1;
}
```

Sign convention: the field returns rock > 0; adversaries return the usual SDF
(inside < 0). The field test is `d > -HULL_TOLERANCE`, so the adversary test is
`sd < HULL_TOLERANCE`, and "the nearer of rock and adversary" in field sign is
`Math.max(dRock, -dAdv)`.

The step diff (positions above are unchanged):

```ts
  // Adversaries: analytic bodies at the tick's end; they never enter the field.
  const adv = scratch.adversaries;
  activeStations(adv, s.z);
  advPosesAt(adv, s.tick + 1, s.z, Math.min(z0, s.z), Math.max(z0, s.z));

  const cs = scratch.collision;
  prepareTick(cs, x0, z0, s.x, s.z);
  const mx = (x0 + s.x) * 0.5, my = (y0 + s.y) * 0.5, mz = (z0 + s.z) * 0.5;
  const crossing = advCrossing(adv, z0, s.z);
  let crossHit = false;
  let cx = 0, cy = 0, cz = 0; // hull centre when it crosses the station plane
  if (crossing >= 0) {
    const t = (adv.stations[crossing]!.z - z0) / (s.z - z0);
    cx = x0 + (s.x - x0) * t; cy = y0 + (s.y - y0) * t; cz = adv.stations[crossing]!.z;
    crossHit = advHullHits(adv, cx, cy, cz, s.qx, s.qy, s.qz, s.qw, cs.probe);
  }
  if (!scratch.ghost && (
    hullHits(cs, mx, my, mz, s.qx, s.qy, s.qz, s.qw) ||
    hullHits(cs, s.x, s.y, s.z, s.qx, s.qy, s.qz, s.qw) ||
    advHullHits(adv, mx, my, mz, s.qx, s.qy, s.qz, s.qw, cs.probe) ||
    advHullHits(adv, s.x, s.y, s.z, s.qx, s.qy, s.qz, s.qw, cs.probe) ||
    crossHit)) s.alive = 0;

  const dRock = distanceAt(cs, s.x, s.y, s.z);
  const d = Math.max(dRock, -adversariesSD(adv, s.x, s.y, s.z)); // nearer of rock and adversary
  s.proximity = proximityOf(d);
  const near = -d;
  // …streak, CLOSE / SO CLOSE unchanged (they read `near`)…
  const dl = Math.max(distanceAt(cs, xl, yl, zl), -adversariesSD(adv, xl, yl, zl));
  const dr = Math.max(distanceAt(cs, xr, yr, zr), -adversariesSD(adv, xr, yr, zr));
  // …THREADED unchanged…
  // DODGED: crossed a station's plane alive, at speed, with the body within DODGE_DIST of the hull centre.
  if (crossing >= 0 && s.alive && sf > C.CLOSE_MIN_SF && s.cooldown === 0 && eventId === 0) {
    const sd = stationSD(adv.stations[crossing]!, adv.poses[crossing]!, cx, cy, cz);
    if (sd < C.DODGE_DIST) { eventId = 5; eventPoints = C.DODGE_BONUS; }
  }
  // …GATE (still overrides), event bookkeeping, tick++ unchanged…
```

### 4.2 Sub-stepping and tunnelling

- **Along z:** a body is stationary in z with depth `2·hz ≥ 2 u`; the hull
  moves ≤ 3.33 u per tick (`MAX_SPEED + OVERSPEED_MARGIN` / 60), sampled at
  the midpoint and the end (1.67 u apart). The z-crossing sub-step above tests
  the hull exactly when its centre is in the station plane, so nothing tunnels
  through a thin body regardless of `hz`. Cost: one extra hull test on the
  crossing tick only.
- **In the plane:** relative lateral motion per tick ≤ 3.33 (plane) + 1.5
  (adversary, `ADV_MAX_STEP`) u. The centre sphere (`HULL_CORE_R = 2`) plus
  the probes at 3–4 u make the hull a solid blob of diameter ≥ 4 u; with body
  thickness `2·r ≥ 4 u` (`rMin ≥ 2` enforced by the audit) a body cannot pass
  between the mid and end samples. If a concept needs thinner bodies, add a
  third sub-step rather than thinner probes.
- No adversary evaluation happens inside the field: chunk meshing, the shell
  skip and the `FEATURE_CLAMP` invariance proof in `field.test.ts` are untouched.

### 4.3 Near-miss integration

- `near` is the nearer of rock and adversary, so CLOSE / SO CLOSE and the
  proximity streak work for adversaries with no new state and no new tuning.
  Proximity rises as a station approaches (the 3D SDF includes the z gap), which
  drives the existing HUD shake and edge glows for free.
- THREADED works between two adversary bodies (the CLOSE jaws, a hoop's rim
  and a wall) because the lateral probes take the same min.
- DODGED (`eventId 5`, `DODGE_BONUS 400 000`, `DODGE_DIST 6`) is the one new
  event: it fires on the crossing tick, shares `EVENT_COOLDOWN` and the
  `sf > CLOSE_MIN_SF` rule, and sits between THREADED and GATE in priority.
  It is stateless because the crossing is detected from `(z0, z1)` of the tick.
- `HudProbe` (render side) should take the same min so the four edge glows
  light up for an adversary beside the wing; it already samples the field at
  ±8 u and can call `adversariesSD` on the game's scratch.

## 5. Rendering

`src/render/adversaries.ts` owns three instanced layers, all driven by
`advPoseAt(st, pose.time, pose.z)` so headless frames are deterministic and
bodies are exactly where the sim had them at every integer tick:

| Layer | Geometry (unit size, scaled per instance) | Material | Purpose |
|---|---|---|---|
| bodies (one `InstancedMesh` per shape, capacity `ADV_MAX·2`) | box: `BoxGeometry(2,2,2)` 12 tris; wedge: custom 6-vertex prism 8 tris; ring: `TorusGeometry(1, 0.25, 4, 16)` 128 tris; blade: box | `MeshLambertMaterial({ flatShading: true })`, per-instance colour = biome accent × 0.9 | lit, faceted, matches the terrain look |
| cores (same geometries, scale 0.55) | `MeshBasicMaterial({ color: 0xffffff })` with `instanceColor` | unlit, so it reads as glowing against lit rock; the telegraph pulse lerps accent → white | telegraph |
| frames (`BoxGeometry` bars, 4 instances per station, capacity `ADV_MAX·4`) | `MeshBasicMaterial` + `instanceColor` | rectangle `2·hw × (ceiling − floor)` at the station z, centred on the spine; brightness `1 − smoothstep(60, 400, dz)` | warning marker on the walls |

Notes:

- `MeshLambertMaterial` does have `emissive`, but it is per material, not per
  instance; that is why the pulse lives on a separate unlit layer instead of
  vertex colours. Fog applies to `MeshBasicMaterial` too, so cores fade with
  distance like everything else.
- Frames are meshes, not baked into chunk colours: baking would couple the
  worker to adversary placement and put a render cue into the field's output.
  Bars that intersect the noisy wall are simply depth-tested away, which reads
  as "mounted on the rock".
- Per frame: `count` instances written with `Matrix4.compose(position,
  quaternion, scale)`; the quaternion about z from `(c, s)` uses
  `Math.atan2` (allowed in `src/render`). `mesh.count = n`,
  `instanceMatrix.needsUpdate = true`, `instanceColor.needsUpdate = true`.
  `frustumCulled = false` (the instances span 1 400 u; culling per instance is
  not worth it at ≤ 64 instances).
- Stations behind the camera (`st.z < pose.z − 40`) are skipped.
- Bodies for `MOTION_CLOSE` are two instances mirrored about `st.cx`.

```ts
// src/render/renderer.ts (addition to GameRenderer)
setAdversaries(adv: AdversaryScratch, time: number, planeZ: number, accent: Rgb | undefined): void;

// src/app/game.ts
render(alpha = 1): void {
  const pose = this.pose(alpha);
  const a = atmosphereAtZ(this.state.seed, this.state.z);
  this.renderer.setAtmosphere(a);
  activeStations(this.scratch.adversaries, this.state.z);
  this.renderer.setAdversaries(this.scratch.adversaries, pose.time, pose.z, a.accent);
  this.renderer.render(pose);
  this.onRender?.(this.state, alpha);
}
```

Test API additions: `snapshot()` gains `adversaries` (active count) and
`adversaryNear`; `window.__game.adversaries()` returns `[{ id, z, shape,
motion, x, y }]` at the current tick so Playwright can assert a body is where
the sim says and a pixel probe on its screen position shows the accent.

Triangle budget: worst case 24 visible stations × (2 × 128 + 48) ≈ 7 k tris;
typical 8–12 stations × 60–300 ≈ 1–3 k, against ~184 k resident terrain.

## 6. Fairness audit and the dodging pilot

### 6.1 `tools/adversary-audit.ts`

```
node tools/adversary-audit.ts [--seeds 1-8] [--length 10000] [--lat 1.0] [--json out.json]
```

Per seed: `gatherStations(seed, 0, length)` (pool sized for the whole range,
tool-side). Per station, three checks:

1. **Speed bound.** Max displacement per tick over one period (sample every
   tick; for CLOSE, sample `dz` from `closeDist` down to 0 in 3.34 u steps, the
   fastest approach) ≤ `ADV_MAX_STEP`; `2·r ≥ 4`.
2. **Static corridor.** For every tick of one period: the set `F(t)` of grid
   points `p` on a 0.5 u lattice inside the disc of radius `core − HULL_R`
   around `(cx, coreY)` with `stationSD(st, pose(t), p, st.z) ≥ HULL_R`
   (`HULL_R = 4.5` = wing tip 4 + tolerance) is non-empty. A free disc of
   radius `HULL_R` centred inside `core − HULL_R` is terrain-free by the core
   tube guarantee, so only the adversary needs testing. This is "a free corridor
   of ≥ 2 × hull radius inside the core tube".
3. **Reachable corridor.** `R(0) = F(0)`; `R(t+1) = F(t+1) ∩ dilate(R(t), lat)`
   with `lat = 1.0` u per tick (60 u/s sustained lateral, well under the plane's
   authority at any speed). Assert `R(t)` non-empty over two periods from every
   phase offset (start the recursion at each of the period's ticks). This is the
   check that catches "the gap exists at every instant but moves faster than a
   plane can follow".

Output: a table per seed (stations, worst free-cell count, worst station id and
tick) and exit 1 on any violation, in the style of `tools/headless/gate.ts`.
Estimated runtime: ≈ 640 stations × 240 ticks × 700 cells × 15 ns ≈ 1.6 s plus
the reachability pass; single-threaded Node.

A short version runs under Vitest (`src/sim/adversaries.test.ts`: seeds 1–3,
3 000 u, static + reachability) so `pnpm check` guards every parameter change;
the full sweep is the story's verification step and is recorded in
`docs/evidence/`.

### 6.2 Behavioural check

The same tool then flies `createPilot(seed, { throttle: 'full' })` (dodge on)
until `z ≥ length` for each seed and asserts `alive === 1`, printing DODGED
counts and the minimum `near` seen at each crossing. Full throttle is the
worst case for the planner's lead time. ≈ 3 600 ticks × 8 seeds × 120 µs ≈ 3.5 s.

### 6.3 Pilot lateral offset planner

The pilot already flies to `(sp.cx, sp.coreY)`. Add an offset target chosen
from nine literal candidates (centre + 8 directions) by predicted clearance at
the arrival tick:

```ts
// src/sim/pilot.ts additions (trig-free; the pilot has its own AdversaryScratch and never touches the sim's)
const CAND = new Float64Array([0, 0, 1, 0, 0.7071, 0.7071, 0, 1, -0.7071, 0.7071, -1, 0, -0.7071, -0.7071, 0, -1, 0.7071, -0.7071]);
const DODGE_HORIZON = 260; // u ahead to start planning
const DODGE_SETTLE = 60; // u before the station where the offset is fully applied
const HULL_R = 4.5;

// per tick, after spineAt(s.seed, s.z, sp):
let tx = sp.cx;
let ty = sp.coreY;
if (dodge) {
  activeStations(adv, s.z);
  const i = nextStationAhead(adv, s.z, s.z + DODGE_HORIZON); // smallest st.z > s.z, or −1
  if (i >= 0) {
    const st = adv.stations[i]!;
    const eta = (st.z - s.z) / (s.speed * C.DT); // ticks to arrival at the current speed
    advPoseAt(st, s.tick + eta, st.z, pose); // planeZ = st.z: the CLOSE gap at its tightest
    const reach = st.core - HULL_R;
    let best = -Infinity;
    let bx = 0;
    let by = 0;
    for (let k = 0; k < 9; k++) {
      const ox = CAND[k * 2]! * reach;
      const oy = CAND[k * 2 + 1]! * reach;
      const clear = stationSD(st, pose, st.cx + ox, st.cy + oy, st.z) - 0.05 * (Math.abs(ox) + Math.abs(oy)); // ties → centre
      if (clear > best) { best = clear; bx = ox; by = oy; }
    }
    const w = 1 - smoothstep(DODGE_SETTLE, DODGE_HORIZON, st.z - s.z); // 0 far, 1 near
    tx += bx * w;
    ty += by * w;
  }
}
const ex = tx - s.x;
const ey = ty - s.y;
// …existing controller…
```

`dodge` defaults to on so goldens, `pnpm sim:run`, the attract-mode pilot and
headless runs all dodge; `{ dodge: false }` exists for tests that want a
collision. The planner reads the same pure functions as the sim, so its
prediction is exact except for the speed assumption, which the audit's
behavioural check covers.

## 7. Cost

| Item | Estimate | Basis |
|---|---|---|
| Gather (per slab change, every 64 u ≈ 0.4–1.3 s) | ≈ 35 µs | 12 cell rolls at 2.5 ns + ≈ 5 `spineAt` at 6.2 µs |
| Poses per tick | `count` × ≈ 25 ns ≈ 0.5 µs | one `floor`, a few multiplies, one table lerp + `sqrt` |
| SDF evaluations per tick, typical (0–1 station in the 37 u band) | 15 × 15 ns ≈ 0.3 µs | 12 hull probes + 3 distance probes, early-out on z |
| SDF evaluations per tick, worst (every station in band, impossible with spacing ≥ 100) | 32 × 15 × 15 ns ≈ 7 µs | |
| Crossing sub-step | 7 evaluations on the crossing tick only | |
| **Total per tick** | **< 2 µs on a 115 µs tick (< 2 %)** | field evaluations at 4.6 µs each remain the cost |
| Pilot planner per tick | 9 SDFs + 1 pose ≈ 0.2 µs | |
| Memory, sim | `AdversaryScratch` ≈ 32 × (20 doubles + pose) ≈ 8 KB | one per `StepScratch`, one per pilot |
| Memory, render | 4 body + 4 core + 1 frame `InstancedMesh`: ≈ 9 × 64 × (64 B matrix + 12 B colour) ≈ 45 KB + geometries < 20 KB | |
| Triangles | 1–3 k typical, 7 k worst | vs ≈ 184 k terrain |
| Audit runtime | ≈ 2 s geometric + ≈ 3.5 s behavioural for 8 seeds × 10 000 u | |

The renderer's per-frame work is `count` pose evaluations and ≤ 64 matrix
composes: microseconds.

## 8. Stories

In the style of `docs/work/CR-0024-near-miss-scoring.md`. IDs assume
`scripts/new-work-item.ts` allocates CR-0031 onward.

### CR-0031 Adversary stations, motion laws, collision and DODGED

**Goal.** Deterministic moving bodies at hashed z stations per biome, evaluated
analytically by the sim for collision, proximity, near misses and a DODGED
event; the scripted pilot dodges them. No rendering yet.

**Files.** `src/terrain/params.ts` (`AdversaryParams`, `BiomeDef.adversaries`),
`src/terrain/difficulty.ts` (tables), `src/terrain/biomes/*.ts` (provisional
sets: canyon `[0, 1]`, others `NO_ADVERSARIES` until CR-0034),
`src/sim/adversaries.ts`, `src/sim/constants.ts`, `src/sim/step.ts`,
`src/sim/pilot.ts` (planner, `dodge` default on), tests, `docs/adr/…-0007-…`,
`docs/domain/adversaries.md`, `docs/domain/scoring.md` (DODGED row).

**Acceptance.**
- `advPoseAt` at integer ticks equals `advPoseAt` at `tick + 0` and `+ 1e-0`
  boundaries exactly; `phase01`, `tri`, `swing`, `circle` have known-answer
  tests; `swing` and `tri` stay in `[−1, 1]`; `circle` output is unit to 1e-15.
- A test places a station by hand (`decodeStation` on a chosen seed/cell), holds
  the plane in its path with ghost off, and asserts `alive === 0` on the
  crossing tick; the same with `HULL_TOLERANCE` clearance asserts survival; a
  thin blade (`hz = 1`) at 200 u/s cannot be tunnelled through (property test
  over phases).
- A pass within `DODGE_DIST` at `sf > 0.5` pays `DODGE_BONUS` once with the
  cooldown set; `near` and `proximity` reflect an adversary when it is nearer
  than rock (test with the plane in open air beside a body).
- `pnpm lint` passes with the sim/terrain restrictions; the stubbed-Math golden
  test still passes.
- The pilot with `dodge: true` survives 3 000 ticks on seeds 1–3 with the
  provisional canyon set; goldens regenerated once (`pnpm sim:regold`,
  0.1.8 → 0.1.9) in the same commit as the constants.

**Verification.** `pnpm check`; `node src/cli/replay.ts run --seed 1 --ticks 3600`
alive; `pnpm test:e2e` cross-engine spec green.

### CR-0032 Fairness audit

**Goal.** A headless Node tool that proves a hull-sized corridor exists and is
reachable at every station for seeds 1–8 over 10 000 u, plus the behavioural
check, and a Vitest subset guarding every parameter change.

**Files.** `tools/adversary-audit.ts`, `src/sim/adversaries.test.ts` (seeds 1–3,
3 000 u), `package.json` (`"adv:audit"` script), `docs/context/headless-validation.md`
(section), evidence in `docs/evidence/2026-09-03-CR-0032/`.

**Acceptance.**
- Speed bound, static corridor and reachability checks as in §6.1; exit 1 with
  the offending seed, station id and tick on any violation.
- A deliberately unfair parameter (e.g. `ampX 1.0` with `rMax 10` on a
  narrowed segment) is caught by the test in `pnpm check`.
- The audit passes for the provisional sets; its JSON output is committed as
  evidence.

**Verification.** `pnpm check`; `pnpm adv:audit` output in the evidence folder.

### CR-0033 Adversary rendering and telegraphs

**Goal.** Bodies, glowing cores and station frames drawn from the same pose
function at `tick + alpha`; HUD callout for DODGED; test-mode introspection.

**Files.** `src/render/adversaries.ts`, `src/render/renderer.ts`,
`src/render/nullRenderer.ts`, `src/app/game.ts`, `src/app/hud.ts`,
`src/app/hudProbe.ts` (glow takes the adversary min), `src/app/testMode.ts`,
`tests/e2e/render.spec.ts` (a station frame), `docs/domain/game-feel.md`.

**Acceptance.**
- `window.__game.adversaries()` reports a body whose projected screen position
  reads the accent colour in `readPixel` on a fixed seed and tick (Playwright).
- Headless contact sheets before and after, read; frame 0…N hashes change with
  the pulse; zero console errors; render gates green.
- Frame hash of a fixed replay is identical across two runs (determinism of
  the render-side time base).
- Golden frame hashes regenerated deliberately (`pnpm headless:golden`).

**Verification.** `pnpm check`; `pnpm test:e2e`; `pnpm headless -- --seed 1
--skip 900 --frames 240 --every 20` sheet in `docs/evidence/2026-09-03-CR-0033/`.

### CR-0034 Per-biome adversary sets

**Goal.** Each biome gets the set the concept doc specifies (archetypes,
sizes, periods, amplitudes), tuned so the audit passes and the pilot survives
10 000 u on seeds 1–8.

**Files.** `src/terrain/biomes/*.ts`, possibly new `ARCHETYPES` rows,
`docs/domain/adversaries.md` (table per biome), evidence sheets per biome.

**Acceptance.**
- `pnpm adv:audit` green for 1–8 × 10 000 u; the pilot survives at full throttle.
- One contact sheet per biome showing a station approached, in
  `docs/evidence/2026-09-03-CR-0034/`.
- Goldens regenerated once; `SIM_VERSION` bump noted in the commit.
- Any archetype needing a latched trigger is filed as an issue with the §2 slot
  design, not implemented inline.

**Verification.** `pnpm check`; `pnpm adv:audit`; `pnpm test:e2e`.

## 9. What the concept doc must supply, and open risks

Per biome: which archetype rows, `spacing`, `prob`, size and period ranges,
`ampX/ampY`, and for jaws `gapMin/closeDist`; plus any concept that needs a
shape or law outside §1.3 (say so early: a new shape is one SDF branch, a new
law is one `switch` case, a latched behaviour is the §2 state change).

Risks and mitigations:

- **Goldens churn.** Three stories touch replays (constants, pilot, biome
  sets). Each regold is one deliberate commit; CR-0031 bundles constants and
  the pilot so there are two bumps in total, not four.
- **Wall clipping.** Lane amplitudes keep `ADV_WALL_MARGIN = 16` from the
  nominal wall, the same margin the ceiling clamp uses; the audit does not check
  wall penetration because it is cosmetic, but the CR-0033 sheets will show it.
- **Blend zones.** Stations are excluded from ±160 u around boundaries; if a
  concept wants adversaries at gates, that needs a mixed-spine lane and is out
  of scope.
- **Pilot speed assumption.** The planner assumes constant speed to arrival;
  the audit's full-throttle survival check is the guard.
