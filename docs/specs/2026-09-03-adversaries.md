---
status: accepted
date: 2026-09-03
supersedes: none
adrs: [0007]
---

# Adversaries — cross-section movers at fixed z stations

Consolidates `docs/research/2026-09-03-06-adversaries-design.md` (concepts,
fairness budget, per-biome picks, tables) and `…-07-adversaries-integration.md`
(engine design, code sketches, audit). Numbers are v1 starting values.

## 1. Rule

An adversary is `pose(seed, station, tick, planeZ)` in the x/y plane at a
constant z. It never moves in z, never draws from the PRNG, never reads player
state except the plane's z (approach laws), and never enters the core tube
before segment 4.

## 2. Engine (`src/sim/adversaries.ts`, `src/terrain/params.ts`)

- `AdversaryParams` on each `BiomeDef`: `spacing`, `prob`, `archetypes[]`,
  `rMin/rMax`, `lenMin/lenMax`, `hz`, `periodMin/periodMax` (ticks), `ampX/ampY`
  (fractions of the free span), `gapMin`, `closeDist`. `NO_ADVERSARIES` disables.
- Shapes: `BOX`, `WEDGE`, `RING`, `BLADE`. Motions: `STATIC`, `SWEEP_X`,
  `SWEEP_Y`, `BOUNCE_X`, `ORBIT`, `CLOSE`. Archetypes (stable ids):
  0 spinning blade, 1 bouncing block, 2 piston, 3 drifting hoop, 4 orbiting
  shard, 5 closing jaws, 6 sweeping spinning blade.
- `decodeStation(seed, seg, gz, params, spine, out)`: hash rolls with salts
  `0xad01…`, z jittered in the cell, skipped before `ADV_START = 600` and within
  `BLEND_LENGTH/2 + reach` of a boundary; rest centre = core; amplitudes clamped
  to the free span minus `ADV_WALL_MARGIN = 16` and `ADV_FLOOR_MARGIN`; period
  divided by `ADVERSARY_SPEED[seg]`, probability times `ADVERSARY_FACTOR[seg]`.
- Motion: `phase01`, `tri`, `swing` (smoothstep-eased triangle), `circle`
  (32-entry literal table, lerp + renormalise), `CLOSE` gap =
  `gapMin + (gapMax − gapMin)·smoothstep(0, closeDist, station.z − planeZ)`.
- SDF: 2D profile distance rotated by the spin, extruded ±`hz`; `CLOSE`
  mirrors the body about the centreline; clamped at `ADV_CLAMP = 40`.
- Scratch: `AdversaryScratch` with a pool of `ADV_MAX = 32` stations gathered
  for `[z − 700, z + 700]`, regathered when the plane changes slab; the near
  list for a tick is the stations whose z band touches the hull's sweep.
- Tick: poses at `tick + 1`; hull vs adversaries at the midpoint, the end, and
  at the exact z-crossing of a station plane (centre sphere `HULL_CORE_R = 2`
  plus the six probes); `near = max(rock, −adversary)` feeds proximity, streak,
  CLOSE / SO CLOSE, THREADED; `DODGED` (`eventId 5`, `DODGE_BONUS 400 000`,
  `DODGE_DIST 6`) fires on the crossing tick at speed under the shared cooldown.
- Difficulty tables (`src/terrain/difficulty.ts`): `ADVERSARY_FACTOR`
  `[0.5, 0.65, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5]`, `ADVERSARY_SPEED`
  `[0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6]`; core crossing allowed
  from segment 4 (`ADV_CORE_FROM`).

## 3. Per-biome sets (v1, from research 06 §3 mapped onto the archetypes)

| Biome | Archetypes | Notes |
|---|---|---|
| canyon hub | drifting hoop (3), bouncing block (1) | hoop off the core before segment 4; blocks in lanes |
| cave | sweeping spinning blade (6) | above the core top, cyan edges |
| crystal spires | spinning blade (0), drifting hoop (3) | blades as rotating crystal stars |
| lava rift | piston (2) from the floor, closing jaws (5) | geysers and "the rift breathes" |
| hoodoo desert | bouncing block (1), orbiting shard (4) | wide hall, long lateral bounces |
| floating archipelago | orbiting shard (4) pairs, drifting hoop (3) | pastel tethers later |
| trench run | closing jaws (5), spinning blade (0) | pistons and fans belong here |

Concepts that need new machinery (crystal iris radial law, geyser floor pads,
boulder shadow, mimic with state) are follow-ups.

## 4. Rendering (`src/render/adversaries.ts`)

Instanced bodies per shape (Lambert, flat), unlit core instances for the
telegraph pulse (accent → white), bar frames at the station z that fade in
from 400 u. Driven by the same pose function at `tick + alpha`; stations behind
the camera skipped; `frustumCulled = false`. `HudProbe` takes the same min so
edge glows react.

## 5. Fairness audit and pilot

`tools/adversary-audit.ts`: per station, speed bound (≤ 1.5 u per tick,
depth ≥ 2 u along z), static corridor (a position inside the core where the
level five-probe hull is clear, at every tick of a period) and reachable
corridor (dilation by 1 u per tick, from every phase).
> **AMENDED 2026-09-03 (CR-0033):** first written as "a free disc of radius
> 4.5 and thickness ≥ 4 u"; the disc over-constrained the vertical (the hull
> is 8 u wide and under 3 u tall) and the thickness rule checked the wrong
> axis. Then the dodging pilot flies seeds 1–8 at full throttle to
10 000 u and must survive. A short version runs under Vitest.

Pilot planner: nine literal candidate offsets inside the core, scored by the
predicted clearance at the arrival tick, blended in over the last 260 u.

## 6. Tests

Known-answer vectors for the motion primitives; property tests for
placement rules and the core invariant on segments 0–3; collision tests by
teleport (into a body, beside a hoop for DODGED, through jaws for THREADED);
pilot survival; headless sheets per biome; goldens regenerated once.
