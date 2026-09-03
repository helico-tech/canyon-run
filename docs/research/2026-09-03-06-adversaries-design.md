---
status: draft
date: 2026-09-03
topic: 2D adversaries per biome (cross-section movers at fixed z stations)
inputs: README.md, docs/specs/2026-09-03-canyon-run-architecture.md, docs/domain/{biomes,scoring,flight-model,difficulty,terrain-field,game-feel,terrain-colour}.md, src/terrain/biomes/*.ts, src/terrain/{biomes,params,features,field,noise,difficulty,colour}.ts, src/sim/{step,collision,state,constants,pilot,prng}.ts, src/render/{renderer,shards,streaks,camera}.ts, src/app/{game,world,hud}.ts
---

# Adversaries that move only in the cross-section

Owner's request: *"research possible adversaries that fit the biome. They
should move only in 2 dimensions, so not forward and backwards. Investigate
some interesting ideas."*

## 0. Premise and one design rule

The game already pays for risk: proximity doubles the rate, the streak adds
50 %, CLOSE / SO CLOSE / THREADED pay lump sums (`src/sim/step.ts`,
`docs/domain/scoring.md`). Static rock is the only thing that kills today. An
adversary is therefore **a moving obstacle that reshapes the cross-section
over time**: it punishes flying where the points are (near rock, near walls,
low over lava) and it pays when you thread it anyway.

One rule keeps every concept fair, replayable and cheap:

> An adversary is a pure function `pose(seed, stationId, tick)` in the x/y
> plane at a constant z. It never moves in z, never reads player state
> (one exception, §2.11), never draws from the PRNG, and never enters the
> core tube before segment 4.

Because the pose is closed-form in the tick, the renderer evaluates the same
function at the fractional `pose.time` (`src/app/game.ts` `pose()`) and gets
smooth motion for free, the scripted pilot can *predict* where an adversary
will be when the plane arrives, and the replay validator reproduces every
kill and every DODGE bonus from `(seed, inputs)` alone.

## 1. Shared framework

### 1.1 Corridor dimensions the adversaries live in

From `src/terrain/biomes/*.ts` and `src/terrain/params.ts` (segment 0
widths; `WIDTH_FACTOR` scales `halfWidth` down to 0.6 by segment 9,
`src/terrain/difficulty.ts`; height is never scaled).

| Biome | hw | width at core height | H | core centre above floor | core r | notes |
|---|---|---|---|---|---|---|
| canyon | 40 (±35 %) | ~90 | 110 | 49.5 | 12 | overhang lip at the top |
| cave | 30 | 60 (ellipse) | 62 | 31 | 11 | stalactites 9 u, stalagmites 6 u |
| crystal spires | 36 | ~80 | 120 | 54 | 12 | crystals 16–42 u tall on the floor |
| lava rift | 30 | ~62 | 140 | 56 | 12 | flat lava floor, tall slot |
| hoodoo desert | 90 (lip 0.6) | 180–250 | 100 | 35 | 12 | widest hall, hoodoos 40 u cells |
| floating archipelago | 80 | ~170 | 170 | 102 | 12 | floor 40 u below the spine |
| trench run | 28 (±5 %) | 56 | 72 (clamp at 56) | 32.4 | 11 | beams sit at ~48 above floor |

Segment 9 multiplies every hw by 0.6: cave 36 wide, trench 34 wide. Sizes in
§2 are therefore **fractions of the local corridor width at the station**,
with absolute caps, never constants.

### 1.2 What the player can dodge in 150 u (the reaction budget)

Flight model (`src/sim/constants.ts`, `docs/domain/flight-model.md`): pitch
1.75 rad/s, roll 3.5 rad/s, yaw 0.7 rad/s, rate filter `RATE_LERP 0.2`
(≈ 5 ticks of lag), speed 50–200 u/s. Turn radius `R = v / ω`.

| manoeuvre from level flight at the core | 170 u/s (R = 97) | 200 u/s (R = 114) |
|---|---|---|
| climb or dive 20 u | 77 u | 85 u |
| climb or dive 40 u | 105 u | 115 u |
| climb or dive 60 u | 129 u | 139 u |
| yaw 20 u sideways (keys only) | 113 u | 130 u |
| yaw 40 u sideways | 153 u | 175 u |
| roll 90° then pitch 20 u sideways (mouse) | 167 u | 191 u |
| roll 90° then pitch 40 u sideways | 195 u | 221 u |

(Displacement `R·(1 − cos θ)` over arc `R·θ` plus 14–17 u of filter lag;
roll 90° costs 0.53 s ≈ 90–106 u.)

**Fairness rule derived from this table:** the open gap must be reachable
with ≤ 40 u vertical or ≤ 20 u lateral displacement from the core when the
station is 150 u away. Anything needing more must be visible from 250 u.
Vertical dodges are the cheap ones, so the best adversaries threaten lanes
that are escaped by climbing or diving.

Line of sight: the spine's bend radius is ≥ 230 u
(`docs/domain/terrain-field.md`); in a 60 u wide corridor the chord visible
around a bend is `2·sqrt(2·230·30) ≈ 235 u`, in a 36 u cave at segment 9
≈ 180 u. 150 u is the floor and it holds everywhere.

### 1.3 Fog: why the glow parts must be unlit and fog-free

`FogExp2` factor is `1 − exp(−(density·d)²)`. Distance at which a lit,
terrain-coloured shape is 50 % fogged (`src/terrain/biomes/*.ts` fogDensity):

| canyon | cave | spires | lava | hoodoo | archipelago | trench |
|---|---|---|---|---|---|---|
| 219 u | 134 u | 185 u | 198 u | 160 u | 173 u | 378 u |

At 150 u in the cave a rock-coloured adversary is 58 % fog. So every
adversary has a **telegraph part** rendered with `MeshBasicMaterial({ fog:
false })` in the biome accent (the sky already does this,
`src/render/sky.ts:82`). Unlit accent on flat-shaded rock reads as "glow"
without post-processing, which is a non-goal (spec §1). Bodies stay
`MeshLambertMaterial({ flatShading: true })` like the terrain.

### 1.4 Motion primitives (all closed-form, no trig, no PRNG)

`fade`, `lerp`, `clamp`, `smoothstep`, `hash1/2/3`, `unit01` already exist in
`src/terrain/noise.ts`. Add these to `src/terrain/adversaries.ts`:

```
frac(u)      = u − floor(u)
tri(u)       = 1 − 4·|frac(u) − 0.5|                        // ±1, constant speed, "bounce"
pw(u)        = φ < 0.5 ? 1 − 16·(φ − 0.25)²                 // parabola wave ≈ sin(2πu), C1,
             :           16·(φ − 0.75)² − 1     (φ = frac(u)) // max error 0.043; a pendulum
circle(u)    = normalise(pw(u + 0.25), pw(u))               // unit direction, sqrt is allowed
bounce(u, h) = 4·h·φ·(1 − φ)                                 // ballistic hop, velocity flips at 0
pulse(φ, a, b, c) = φ<a ? 0 : φ<b ? fade((φ−a)/(b−a)) : φ<c ? 1 : 1 − fade((φ−c)/(1−c))
waypoint(k)  = lo + (hi − lo)·unit01(hash2(station, k, seed ^ SALT))
dart(t, P)   = lerp(waypoint(k), waypoint(k+1), fade(clamp((frac(t/P) − 0.6)/0.4, 0, 1))), k = floor(t/P)
u            = (tick + phase) / P_ticks     // P_ticks integer, phase integer in [0, P_ticks)
```

Periods are integer ticks (`P_ticks = 60·P / tempo`, tempo from the segment
table in §4) and phases are hashed integers, so `u` is one correctly-rounded
IEEE division per evaluation and identical on every engine (ADR 0002).
Rotation uses `circle(u)`, never a table lookup that needs an angle.

Motion speed cap: **≤ 60 u/s (1 u per tick)** for every kill volume. It keeps
motion readable at 170 u/s and makes per-tick pose sampling safe.

### 1.5 Stations: placement, exclusions, lane check

Stations are hashed on 1D z cells exactly like arches
(`src/terrain/features.ts` `archProb` block): `spacing` per segment (§4),
probability per segment, jittered z inside the cell, per-biome kind list.
A station is skipped when:

- it is within `CLEAR_HALF + 85 = 160 u` of a segment boundary (covers the
  75 u clear zone and the whole 320 u blend, `src/terrain/biomes.ts`), so
  gates stay calm and the corridor params are unmixed at every station;
- another station is within 100 u (adjacent cells with small spacing);
- z < 400 u (first seconds of the run);
- the **lane check** fails: at the station z the static field
  (`FieldSampler.density`, `src/terrain/field.ts`) is sampled at 12 hashed
  candidate points in the cross-section; the kind's *never-entered region*
  (§2, "guaranteed gap") must contain an air disc of radius ≥ `G_min / 2`,
  or the station does not spawn. This is what stops a pillar or a crystal
  from turning a fair adversary into a wall. Sampling happens once per
  station when it is gathered, not per tick.

`G_min = max(28 u, gapFactor(segment) · width)` where 28 = core diameter + 4.

### 1.6 Sim integration

- `src/sim/collision.ts`: `hullHits` and `distanceAt` take
  `min(field, adversarySD(seed, x, y, z, tick))`. Adversary SDFs reuse the
  primitives already in `featuresSD` (box, capsule, ring, sphere, hex prism,
  segment). Only stations with `|z − station.z| ≤ HULL_REACH + z halfthickness`
  are tested: at most one or two per tick.
- `near = −d` in `src/sim/step.ts` then covers adversaries automatically:
  proximity, the streak, CLOSE, SO CLOSE and THREADED all work unchanged.
- New event `DODGE` (`eventId 5`, `DODGE_BONUS 300 000`): fires on the tick
  the plane's z crosses a station's z while alive with an adversary surface
  within `DODGE_DIST 6 u` of any hull probe at that station. Shares the
  36-tick cooldown, never blocks GATE. `EVENT_NAMES` gains `'dodge'`
  (`src/app/hud.ts:31`).
- Kill volumes are ≥ 1.5 u half-thick in z: the two collision sub-steps are
  1.67 u apart at 200 u/s (`docs/domain/flight-model.md`), so anything thinner
  could be stepped over. **Draw what kills**: a laser is a 3 u bar, not a
  line with an invisible hitbox.
- State stays stateless except for §2.11 (two extra hashed floats).
- `SIM_VERSION` bump and `pnpm sim:regold` (goldens change because collision
  and score change even if the pilot never touches an adversary).

### 1.7 Pilot

`src/sim/pilot.ts` follows the core within ~2 u. With the "core inviolable
before segment 4" rule the goldens (1800 ticks, z ≤ 5100, segments 0–3)
survive untouched. Add a predictive dodge anyway so deep headless runs
(`--skip 840`) and later segments work: for the nearest station ahead within
250 u, evaluate `pose(station, tick + (station.z − z)·60/speed)` and add a
push away from it to the desired offset, clamped inside the core radius. It
is exact because the motion is closed-form.

### 1.8 Render integration

`src/render/adversaries.ts`: one `InstancedMesh` per primitive (box,
octahedron, hex prism, torus 8×3, icosahedron, flat octagon), capacity 32
each, updated every frame from the stations in `[z − 40, z + 700]` with
`pose(seed, station, pose.time)`. Two materials: Lambert flat-shaded for
bodies, unlit fog-free for glow parts. Per-instance colour via
`setColorAt` as `src/render/shards.ts` does. No worker changes, no chunk
goldens change, no field or shell-bound change.

## 2. Concepts

Each: silhouette (1–3 primitives), size, motion, telegraph, threat,
fairness, payoff. "Guaranteed gap" is the region the shape never enters,
which the lane check (§1.5) verifies against static rock.

### 2.1 Sentry ring — canyon hub, floating archipelago

- **Silhouette.** A chunky torus (8 radial × 3 tubular segments, so it is
  visibly polygonal), inner radius 10 u, tube 1.5 u; one small octahedron
  "eye" (2 u) on the rim. Two primitives.
- **Size.** Outer diameter 23 u; scaled by `clamp(width / 90, 0.5, 1)`.
- **Motion.** Slow Lissajous in the cross-section: `x = x0 + Ax·pw(u/3)`,
  `y = y0 + Ay·pw(u/2)` with `Ax, Ay ≤ 12 u`, periods 9 s and 6 s. The ring
  wobbles rather than travels. `x0, y0` is the best air disc from the lane
  check, at least `core r + 12 + 2` from the spine before segment 4.
- **Telegraph.** Tube in the biome accent, unlit. The eye blinks white
  (0.15 s, `pulse`) once per period. A ring on axis reads at 400 u as a
  small circle growing; the wobble is obvious because it is perpendicular
  to the view axis.
- **Threat.** A 23 u obstacle off the core. Ignored, it costs nothing.
- **Fairness.** Guaranteed gap: everything outside the ring's 25 u disc
  plus the core. Never on the core before segment 4; from segment 4 the
  ring may drift across the core (the hole is 20 u; the core is 24 u).
- **Payoff.** Threading it is the point. The lateral probes at ±8 u
  (`THREAD_PROBE`) sit 2 u from a tube at inner radius 10, so THREADED
  (+500 k) fires on a clean pass through the middle, DODGE (+300 k) fires
  at the station, and a hull wing at ±4 u has 6 u to spare. A grazing pass
  (tube within 3 u of the centre probe for 5 ticks) is unlikely at speed,
  so CLOSE stays rare here and the ring's own reward is the thread.

### 2.2 Lane drones — canyon hub, hoodoo desert

- **Silhouette.** Octahedron body 4 u plus a flat bar 10×0.8×0.8 u through
  it (a wing). Two primitives. Two or three drones per station, 30 u apart
  in z so they read as a formation.
- **Size.** 10 u span; 3.5 u kill radius (sphere SDF) per drone.
- **Motion.** `dart(t, P)` between hashed waypoints, `P` 1.8 s: hold, then
  a quintic dart of 0.6 s (fixed, not scaled by tempo) to the next
  waypoint, ≤ 18 u away (peak 56 u/s). Drone A's waypoints are restricted to the left half, drone B's
  to the right half, drone C's to the upper third (hoodoo only, hall is
  wide). All waypoints stay ≥ 19 u from the spine before segment 4.
- **Telegraph.** Body in the biome accent, unlit. Wind-up: for the 10 ticks
  before a dart the body scales 1.0 → 1.35 → 1.0 (`pulse`), which is the
  classic "about to move" cue and is trig-free. The hold-then-dart rhythm
  is the tell: a resting drone is a drone that will move soon.
- **Threat.** Blocks a lane; the formation's lanes shift while you approach.
- **Fairness.** Guaranteed gap: the core plus the whole half the drone is
  not assigned to. A dart never crosses the spine. From segment 4 waypoints
  may touch the core edge (never its centre) so the safe path narrows.
- **Payoff.** DODGE at each drone's z (three drones = three chances, but the
  cooldown makes it one bonus per formation), proximity streak while
  passing within 10 u of each.

### 2.3 Compactor panels — trench run, lava rift

- **Silhouette.** Two wall panels (boxes 3 u thick in z, 14 u tall, 2 u
  deep in x) flush with each wall, with a 1 u accent stripe box on the
  inner face. Two primitives per panel.
- **Size.** Panel height 0.25·H (trench 18 u, rift 35 u) centred on the
  core height; thrust depth `hw − core r − 3` (trench 14 u, rift 15 u).
- **Motion.** `x = wall ∓ thrust · pulse(φ, 0.62, 0.68, 0.76)` with period
  4 s: 2.5 s open, 0.25 s thrust (56 u/s, under the cap), 0.3 s hold,
  1 s retract. Both panels share the phase (they clap).
- **Telegraph.** Stripe in the accent (trench red, rift yellow), unlit.
  0.5 s before the thrust the stripe brightens to white and the panel
  scales 1.0 → 1.1 in x (a "breath in"). The trench's straight walls make
  the panel pair visible from 350 u (fog 50 % at 378 u).
- **Threat.** Closes the space next to the walls, which is exactly where
  the proximity streak is earned. The core never moves.
- **Fairness.** Guaranteed gap: `2·(hw − thrust) = 28 u` around the spine,
  always, by construction. A player hugging the wall at 170 u/s needs a
  20 u lateral move: 113 u by yaw, 167 u by roll+pitch, so the wind-up must
  start when the plane is 250 u out. With a 4 s period and 0.5 s wind-up
  the panels are simply readable: watch the stripe, pick the moment.
- **Payoff.** Passing through the clap with a panel face within 6 u pays
  DODGE; hugging a retracting panel keeps the streak alive.

### 2.4 Scan bar — trench run (segment 4+), crystal spires (segment 4+)

- **Silhouette.** A bar 3×3 u in cross-section spanning the full corridor
  (box), two emitter cubes 4 u on the walls. Three primitives.
- **Size.** Full width. Half-thickness in z 1.5 u.
- **Motion.** `y = lo + (hi − lo)·(0.5 + 0.5·pw(u))`, period 3 s, `lo = floor
  + 20`, `hi = clamp − 16` (trench: sweeps 20…40 above the floor).
  Alternating stations use the vertical version sweeping in x.
- **Telegraph.** Bar unlit in the accent (trench red), emitters white. At
  the extremes of the sweep the bar is 34 u off the floor or 16 u under the
  clamp, so the open lane is always visible as the bigger dark half.
- **Threat.** Sweeps through the core. This is the late-game upgrade of the
  compactor, only allowed from segment 4.
- **Fairness.** Guaranteed gap: `≥ 34 u` above or below the bar at every
  instant (`hi − lo = 20`, bar 3 u, corridor 56 u). A vertical dodge of
  ≤ 40 u costs ≤ 115 u at 200 u/s, inside the 150 u budget. Never in the
  same station as a beam (`FEATURE_BOX` beams sit at ~48 above the floor,
  `src/terrain/features.ts` beam block); the lane check catches it.
- **Payoff.** DODGE if the bar passes within 6 u; THREADED does not apply
  (one-sided), so the bar is a lower-reward, higher-adrenaline hazard.

### 2.5 Crystal iris — crystal spires

- **Silhouette.** Six hex prisms (the biome's own crystal shape,
  `crystalSD` in `src/terrain/features.ts`) pointing at the spine from six
  directions, tips inward. One primitive, six instances.
- **Size.** Each petal 5 u radius, length `0.9·hw − R_closed`.
- **Motion.** Radial only: tip radius `r(t) = R_closed + (R_open −
  R_closed)·(0.5 + 0.5·pw(u))` with a 40 % dwell at open (`pulse`
  envelope), period 3.5 s. `R_closed = 13.5 u`, `R_open = 0.9·hw`.
- **Telegraph.** Petal faces in the three crystal tints (`palette.crystals`),
  tips unlit cyan (accent). A hexagonal aperture on axis is the most
  readable silhouette in the game: its size *is* the gap.
- **Threat.** Closes the gap around the core. The core is never touched:
  13.5 > 12.
- **Fairness.** Guaranteed gap: the 27 u hole, always. Hull wings at ±4 u
  clear the petals by 9.5 u when closed.
- **Payoff.** This is the THREADED machine: closed, the petals are 5.5 u
  from the ±8 u probes, under `THREAD_DIST 6`, so a centred pass through a
  closed iris pays THREADED + DODGE; an open iris pays nothing unless you
  brush a petal (CLOSE). Time your arrival for the closed phase and hold
  the centre.

### 2.6 Lava geysers — lava rift

- **Silhouette.** A hex prism column 6 u across rising from the floor, an
  unlit flat octagon "vent" pad 9 u on the floor. Two primitives; 2–3 per
  station spread across the width, 5 u thick in z.
- **Size.** Column height `H_g ≤ coreY − core r − 2 = 42 u` before segment
  4, up to `coreY` (56 u) after.
- **Motion.** `h = H_g · pulse(φ, 0.55, 0.67, 0.85)`: dormant 2.2 s, rise
  0.7 s (60 u/s), hold 0.7 s, sink 0.6 s, period 4 s. Vents at one station
  have phases offset by ⅓ period so at most one column is up at once.
- **Telegraph.** Vent pad glows yellow (accent) permanently, so "geysers
  live here" is visible from 300 u even when nothing is up; 0.5 s before
  the rise the pad pulses to white and scales 1.3×. The column itself is
  unlit orange-yellow with a Lambert dark-slag cap.
- **Threat.** Pulses. Punishes floor skimming, which is where the streak is
  earned in this biome (flat lava floor, `floorNoiseAmp 0.5`).
- **Fairness.** Guaranteed gap: everything above `coreY − core r` (the
  rift is 140 u tall), plus the two-thirds of the width whose vent is down.
  A dive-to-climb of 40 u costs ≤ 115 u. The floor pads mark every possible
  column position, so nothing appears without a standing warning.
- **Payoff.** DODGE when a column top or side is within 6 u at the station;
  SO CLOSE is realistic here because a rising column can hold the plane
  within 1.5 u for 5 ticks as you skim over its cap.

### 2.7 Bouncing boulder — hoodoo desert, canyon hub

- **Silhouette.** Icosahedron (1 primitive) rock, radius 5–8 u, plus an
  unlit flat blue octagon "shadow" on the floor directly beneath it, scaled
  by height. Two primitives.
- **Size.** Radius `clamp(0.04·width, 4, 8)`.
- **Motion.** `y = floorY + r + bounce(u_b, H_b)` with period 1.6 s;
  `x = cx + A·tri(u_x)` with period 7–9 s and `A = 0.8·hw − r` (constant
  lateral speed ≤ 20 u/s, reverses at the walls like a bounce). Two
  incommensurate integer-tick periods make the path feel alive without any
  randomness. `H_b`: apex `≤ coreY − core r − 2` before segment 4 (hoodoo:
  boulder centre ≤ 21 − r above the floor), apex up to `coreY` after.
- **Telegraph.** The blue shadow (hoodoo accent is blue, `[40,140,255]`,
  otherwise unused on terrain) is the tell: a blue disc on a cream floor
  reads at 400 u and its size tells the boulder's height. Rock faces use
  the wall ramp so the boulder looks like the hoodoos it bounces between.
- **Threat.** Sweeps the low lane laterally and vertically.
- **Fairness.** Guaranteed gap: everything above the apex. The hall is
  100 u tall with the core at 35, so the upper half is a highway.
- **Payoff.** DODGE at the station; CLOSE on a low pass over the apex.

### 2.8 Orbiting rock pair — floating archipelago

- **Silhouette.** Two ridged rocks (icosahedron, r 4–7 u, the biome's
  floating rocks are ellipsoids of 6–18 u) joined by a thin unlit pink
  tether (a `LineSegments` pair, cosmetic only). Two kill primitives.
- **Size.** Orbit radius `R_orb = 14–24 u` (≤ 0.15·width), disc ≤ 0.35·width.
- **Motion.** `p_i = c + R_orb · circle(u + i/2)`, period 4 s (rim speed
  ≤ 38 u/s at R 24). Before segment 4 the centre `c` is ≥ `R_orb + r + core r
  + 2` from the spine (an off-axis pair); from segment 4 a second variant
  orbits **around the core itself** with `R_orb − r ≥ core r + 2`: the core
  stays clear while everything around it is swept once per 2 s.
- **Telegraph.** Tether in the accent pink, rocks in the pastel wall ramp;
  the orbit plane faces the player so the circle is read as a circle.
- **Threat.** Sweeps a disc; the around-the-core variant closes the gap on
  every side in turn.
- **Fairness.** Guaranteed gap: outside the orbit disc plus the core. The
  around-the-core variant leaves the 28 u core hole always open and needs
  no dodge if you stay centred; leaving the centre is the gamble.
- **Payoff.** Threading between the two rocks of an off-axis pair when they
  are horizontal puts both probes within 6 u: THREADED + DODGE. That is a
  timing trick with a 2 s window, the best skill test in the set.

### 2.9 Turbine — trench run, crystal spires

- **Silhouette.** A hub ring (torus 8×3, inner radius `core r + 1.5`) and
  three blades (boxes 6 u wide, 3 u thick in z) from the hub to `0.95·hw`.
  Two primitives, four instances.
- **Size.** Full corridor radius; the hub hole is 25–27 u.
- **Motion.** Rotation about the spine: blade `i` direction `circle(u + i/3)`,
  period 4.5 s (tip speed 36 u/s at r 26, 58 u/s at tempo 1.6). Segment SDF
  per blade.
- **Telegraph.** Blade leading edges unlit accent (red / cyan), hub grey
  Lambert. A rotating three-spoke silhouette is unmistakable at 300 u.
- **Threat.** Sweeps the whole annulus around the core; the core is never
  touched (hub is a ring, not a disc).
- **Fairness.** Guaranteed gap: the core hole, always; between blades the
  arc gap at radius 20 is `2π·20/3 − 6 ≈ 36 u`. Never combined with a
  cross beam at the same z (lane check).
- **Payoff.** Threading between blades near the wall pays DODGE + proximity;
  through the hub, THREADED (the hub tube is 4.5–5.5 u from the ±8 u
  probes, under `THREAD_DIST 6`).

### 2.10 Swinging blade — cave

- **Silhouette.** A horizontal bar (box 16×2×3 u) hanging from two thin
  rods (boxes 0.6 u) off the ceiling. Three primitives.
- **Size.** Bar span `0.5·width`; rod length `L = ceilY − 8 − (coreY + core
  r + 4)`, about 8–12 u in the cave.
- **Motion.** Pendulum on an exact arc: `x = cx + A·pw(u)`, `y = pivotY −
  sqrt(L² − (x − cx)²)`, period 3.2 s, `A = 0.5·hw` (peak 38 u/s at tempo 1,
  60 u/s at 1.6). `sqrt` is permitted (ADR 0002).
- **Telegraph.** Bar edges unlit cyan; the rods stay dark so the bar looks
  like a floating blade. In the cave's 134 u fog the unlit bar is the only
  thing that reads at 150 u, which is the point.
- **Threat.** Sweeps the upper third of the tube laterally.
- **Fairness.** Guaranteed gap: everything below `coreY + core r + 2`,
  always: the bar's lowest point is above the core top by construction.
  Down there are the stalagmites (6 u) and boulders, so "dive under it" is
  a real choice, not a free one.
- **Payoff.** DODGE when the bar passes within 6 u; CLOSE when you fly
  just under the bottom of the swing.

### 2.11 Mimic — hoodoo desert (later: canyon)

The one adversary with agency. It **tracks the player's x/y** at its own z
station with a capped speed, so it lurks where you are and you must juke at
the last moment.

- **Silhouette.** Octahedron 5 u with a 12 u unlit blue ring around it (the
  hoodoo accent). Two primitives.
- **Motion.** State `(mx, my)` in `SimState` (two extra hashed floats,
  `checksum` in `src/sim/state.ts` extended): each tick move toward the
  plane's `(x, y)` by ≤ 25 u/s, quintic-limited near the target; clamp to
  ≥ `core r + 5` from the spine before segment 4 (it sits at the core's
  edge on your side when you are centred). Activated when the plane is
  within 300 u of the station; only one Mimic is active at a time (nearest
  station ahead).
- **Telegraph.** It faces you and moves *with* you, which is its own
  warning; the ring pulses at 2 Hz.
- **Threat.** Closes the gap you were going to use.
- **Fairness.** 25 u/s tracking versus your 60 u/s of pitch authority:
  a 20 u vertical juke inside the last 80 u beats it every time; jinking
  earlier only makes it follow. Core inviolable before segment 4.
- **Payoff.** DODGE and usually CLOSE, because the juke passes within
  2–3 u. Highest tension per station.

Because the Mimic reads player state, it is deterministic from `(seed,
inputs)` like everything else, but it is the only concept whose motion the
pilot cannot precompute; the pilot's core-following already keeps it out of
the core, so goldens are unaffected.

## 3. Per-biome recommendation

| Biome | Primary | Secondary | Why | Palette note (accent from `palette.accent`) |
|---|---|---|---|---|
| canyon hub | sentry ring (2.1) | lane drones (2.2) | wide slot with pillars; rings give an opt-in thread, drones shift lanes between the pillars | cyan `[46,230,214]` tubes and drone bodies, grey `[60,64,76]` Lambert bodies; the gate uses the *next* biome's accent, so keep adversary glow ≤ 3 u thick to avoid reading as a gate |
| cave | swinging blade (2.10) | orbiting pair around the core (2.8 late variant), if the 36 u tube at segment 9 passes the lane check | tightest, foggiest tube; a single big readable sweep beats a swarm of small shapes | cyan `[60,230,235]` edges on dark blue-grey rods; nothing pastel, nothing lit |
| crystal spires | crystal iris (2.5) | turbine (2.9) as a rotating crystal star, scan bar from segment 4 | the biome is already made of hex prisms; the iris reuses `crystalSD` and the three crystal tints | petals in `palette.crystals` (cyan, magenta, lime), tips unlit cyan `[51,240,255]` |
| lava rift | geysers (2.6) | compactor panels (2.3) as "the rift breathes" | flat lava floor invites skimming; geysers punish it from below, panels from the sides | yellow `[255,210,63]` pads and stripes, unlit orange `[255,122,42]` columns, charcoal caps |
| hoodoo desert | bouncing boulder (2.7) | Mimic (2.11), lane drones | widest hall: room for a long lateral bounce and for a tracker that has somewhere to go | blue `[40,140,255]` shadows and rings, boulders in the cream wall ramp |
| floating archipelago | orbiting pair (2.8) | sentry ring (2.1) | tall pastel hall with floating rocks; pairs and rings float naturally | pink `[255,120,180]` tethers and tubes, rocks in violet-pink wall ramp |
| trench run | compactor panels (2.3) | turbine (2.9); scan bar (2.4) from segment 4 | artificial: pistons, fans and lasers belong; straight walls give 350 u of sight | red `[255,59,48]` stripes and blade edges, panel grey `[90,96,112]`, white emitters |

## 4. Difficulty by segment

Literal tables in `src/terrain/difficulty.ts`, indexed like `WIDTH_FACTOR`
(hub 1200 u, special 2400 u, alternating; entries beyond 9 repeat the last).

| Segment | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9+ |
|---|---|---|---|---|---|---|---|---|---|---|
| station spacing (u) | 500 | 420 | 350 | 300 | 260 | 230 | 200 | 180 | 160 | 150 |
| station probability | 0.3 | 0.5 | 0.65 | 0.8 | 0.9 | 0.95 | 1.0 | 1.0 | 1.0 | 1.0 |
| tempo × (periods divided by) | 0.6 | 0.75 | 0.9 | 1.0 | 1.1 | 1.2 | 1.3 | 1.4 | 1.5 | 1.6 |
| gap factor (G_min as a fraction of width, floor 28 u) | 0.7 | 0.65 | 0.6 | 0.55 | 0.5 | 0.47 | 0.44 | 0.42 | 0.4 | 0.4 |
| amplitude × (swing, bounce, orbit, thrust) | 0.6 | 0.75 | 0.9 | 1.0 | 1.0 | 1.05 | 1.1 | 1.15 | 1.2 | 1.2 |
| core allowed (scan bar, late orbit, Mimic edge, drones at core edge) | no | no | no | no | yes | yes | yes | yes | yes | yes |
| drones per station | 1 | 2 | 2 | 2 | 3 | 3 | 3 | 3 | 3 | 3 |

Per-biome base multipliers on spacing (dense artificial biomes, sparse wide
halls): canyon 1.0, cave 0.9, spires 0.95, lava 0.85, hoodoo 1.1,
archipelago 1.0, trench 0.75.

Reading: segment 0 has at most 2–3 stations in 1200 u, all slow, all
off-core, gap ≥ 70 % of the width. Segment 9 has a station every 150 u at
1.6× tempo with the core crossable, on a corridor already at 60 % width.
Tempo scales periods only. The fast strokes (compactor thrust 0.25 s,
geyser rise 0.7 s, drone dart 0.6 s) keep their duration at every tempo, and
the base periods of the continuous movers (§2) are chosen so that at 1.6×
no kill volume exceeds 60 u/s: ring 26, iris 35, scan bar 43, boulder 53–60,
orbit 60, turbine 58, blade 60 u/s.

## 5. Ideas beyond moving walls, ranked by fun per effort

Shared infrastructure first (stations, motion primitives, SDF hook in
`collision.ts`, DODGE event, instanced renderer, pilot dodge, tests):
about 1.5 developer days. Then each kind:

| Rank | Kind | Fun | Effort | Why it ranks here |
|---|---|---|---|---|
| 1 | Sentry ring (2.1) | high | 0.25 d | torus SDF exists (arch code), Lissajous is two `pw` calls, opt-in THREADED makes it a skill toy |
| 2 | Crystal iris (2.5) | high | 0.3 d | `crystalSD` exists, one radial parameter, best silhouette, THREADED interplay by numbers |
| 3 | Compactor panels (2.3) | high | 0.3 d | box SDF exists, one `pulse`, punishes the wall-hug that pays, trench trope |
| 4 | Lane drones (2.2) | high | 0.4 d | sphere SDF, waypoints with `fade`, formation logic per half |
| 5 | Lava geysers (2.6) | high | 0.4 d | capsule/hex SDF, one `pulse`, floor pads are free telegraphs |
| 6 | Orbiting pair (2.8) | high | 0.4 d | two spheres on `circle`, the around-the-core variant is the best late hazard |
| 7 | Turbine (2.9) | medium-high | 0.5 d | segment SDF is new, three instances, rotation via `circle` |
| 8 | Bouncing boulder (2.7) | medium | 0.4 d | two waves, shadow disc; the hall is so wide the boulder is rarely in the way |
| 9 | Scan bar (2.4) | medium | 0.2 d | trivial motion, but one-sided and only from segment 4 |
| 10 | Mimic (2.11) | very high | 0.7 d | needs sim state, activation rules, extra tests; ship after the stateless kinds |
| 11 | Swinging blade (2.10) | medium | 0.3 d | fine in the cave, but the cave is already the hardest biome; ship at low tempo |
| 12 | Bat ring (six 2 u bats orbiting the core at r 15) | medium | 0.3 d | too small to read at 150 u in cave fog; unfair at speed, rejected for v1 |
| 13 | Dust devil (drifting column, hoodoo) | low | 0.3 d | a pillar that moves; the hoodoos already do this statically |
| 14 | Shockwave ring (expanding torus from the core) | low | 0.3 d | "stay in the core" is the only answer; boring |

Ship order for "a few days": 1–6 (about 2 days after the infrastructure),
then 7–9, then the Mimic.

## 6. What must NOT be done

- **No motion in z.** Stations are constants per hash; the shape's z
  extent is fixed. Nothing "drifts with the corridor": the spine is a
  function of z, so a station simply *is* where the spine puts it. No
  chasers, no approaching missiles, no shapes that "come at you".
- **No per-frame or non-sim randomness.** Motion depends on `(seed,
  stationId, tick)` only. Never draw from `s.rng` for adversaries: the gust
  draw in `step.ts` is the only consumer and any extra draw shifts the
  stream and every golden. Hash, do not draw.
- **No trig, exp or pow** in `src/sim` and `src/terrain` (lint gate,
  `src/sim/lint-gate.test.ts`); §1.4 gives trig-free equivalents. `sqrt` is
  fine. Render-side code may use anything but must call the same `pose()`
  so the picture matches the kill.
- **Nothing unfair at 200 u/s:** no kill volume thinner than 1.5 u half-
  thickness in z; no shape faster than 60 u/s; no open gap under 28 u; no
  gap that needs > 40 u vertical or > 20 u lateral from the core at 150 u
  unless the station is readable from 250 u; nothing that reads only when
  lit (fog); nothing that first becomes visible in the last 150 u
  (stations sit ≥ 160 u from boundaries, so a gate never hides one).
- **Never in the core tube on segments 0–3**, and never *centred* on the
  core at any segment except kinds whose own hole is ≥ 25 u (iris,
  turbine, around-the-core pair). The core guarantee is what keeps the
  pilot, the goldens and every headless run alive
  (`docs/domain/terrain-field.md`, core carve).
- **No adversaries in the field or the worker.** They are not marching-
  cubes rock; re-meshing per tick would cost more than the whole terrain
  budget (`docs/context/performance.md`). SDFs in the sim, instanced meshes
  in the renderer.
- **No station inside the clear zone or a blend** (±160 u of a boundary),
  and none within 100 u of another station.
- **No invisible hitboxes and no hitboxes smaller than the drawing.** Draw
  the kill volume; the beam is 3 u thick because 3 u is what kills.
- **No adversary that only "blocks"**: every kind must have a payoff path
  (DODGE at least, THREADED where the geometry allows). A hazard with no
  reward is a wall.
- **No per-tick allocation**: poses are written into preallocated
  `Float64Array` scratch (ADR 0006 style, positional scalars in the kernel).

## 7. Implementation sketch and verification

Files: `src/terrain/adversaries.ts` (stations, motion primitives, SDFs, per-
biome kind lists; `AdversaryParams` on `BiomeDef` in
`src/terrain/biomes.ts`), `src/terrain/difficulty.ts` (tables of §4),
`src/sim/collision.ts` (min with `adversarySD`), `src/sim/step.ts` (DODGE),
`src/sim/constants.ts` (`DODGE_BONUS`, `DODGE_DIST`, `ADV_CORE_FROM 4`),
`src/sim/state.ts` (Mimic floats, later), `src/sim/pilot.ts` (predictive
dodge), `src/render/adversaries.ts`, `src/app/game.ts` (one call in
`render()`), `src/app/hud.ts` (`'dodge'`), docs
(`docs/domain/adversaries.md`, `docs/domain/scoring.md`,
`docs/domain/difficulty.md`), goldens regenerated.

Tests worth writing (not ceremony):

- known-answer vectors for `tri`, `pw`, `circle`, `bounce`, `pulse`, `dart`
  (bit-exact, cross-engine like `noise.test.ts`);
- property: for every registered kind, 10 000 hashed `(station, tick)`
  samples at segments 0–3 never put a kill volume inside the core tube, and
  the guaranteed gap of §2 holds at every sample;
- property: no station within 160 u of a boundary or 100 u of another;
- collision: teleport into a panel mid-thrust kills; pass 5 u beside a ring
  at its station pays DODGE exactly once; a centred pass through a closed
  iris pays THREADED;
- pilot: seeds 1–8, 3600 ticks at full throttle survive with adversaries on;
- headless: a contact sheet at a station in each biome, before and after,
  with the console gate.

Estimated total for one developer: infrastructure 1.5 d, first six kinds
2 d, pilot dodge, tests, docs and goldens 1 d. About 4.5 days.
