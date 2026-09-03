# Adversaries

Moving kill volumes that live in the cross-section of the tube (ADR 0007,
spec `docs/specs/2026-09-03-adversaries.md`). They never move along z: each
one is a *station* pinned to a z plane, posed by a closed-form law of the tick,
so a replay needs no extra state and the renderer draws exactly what the sim
tests.

## Stations

A station is decoded from `(seed, biome mode, segment, station z)` by a hash
and rejected by placement rules; nothing is stored. Stations start at
`ADV_START` (600 u), are spaced by the biome's `spacing` with probability
`prob`, and are gathered for a window of `ADV_WINDOW` (700 u) around the plane.
Every station carries a shape, a motion law, a spin, a body size (`r` half
height, `len` half width, `hz` half depth), a period, a phase, and a core
radius used by the fairness rules.

## Archetypes (stable ids; replays depend on them)

| id | body | motion | where it lives |
|---|---|---|---|
| 0 | spinning blade | static | beside or above the core |
| 1 | bouncing block | bounce in x | above or below the core |
| 2 | piston | sweep in y | a press dipping into the core from the roomier side |
| 3 | drifting hoop | sweep in x | around the core; its opening always overlaps the core |
| 4 | orbiting shard | orbit | around the core at `core + body + 2` |
| 5 | closing jaws | close as the plane approaches | either side of the core, gap ≥ `gapMin` |
| 6 | sweeping spinning blade | sweep in x | beside the core only (never crossing) |
| 7 | crystal iris | pulse (radius breathes) | on the core; closed it still clears the core before segment 4, later still fits the level hull |
| 9 | boulder shadow (thin slab) | aim: mirrors the plane, locks at `closeDist`, holds | inside the core from segment 4; thin enough that a lane above or below always remains |
| 10 | mimic shard | aim (as above) | inside the core from segment 4 |
| 8 | geyser | erupt (rests in the floor, one eased burst per period) | rises to just below the core before segment 4, later to just below a 3 u lane at the top of the core; never faster than 0.9 u per tick |

Motion is transcendental-free: triangle and swing waves, a 32-entry circle
table, an approach-driven law for jaws (the gap depends on the plane's
distance, not on time), and the aim law (CR-0045). Aimed bodies are the one
kind with state: while the plane is further than `closeDist` the body mirrors
the plane's cross-section position (clamped to the core); the first tick the
plane is inside `closeDist` the nearest aimed station ahead locks, and the
state records `advLockId`, `advLockX`, `advLockY` (hashed, so replays carry
them). The body then holds that position; a passed station keeps its lock
until it is out of the collision band, so it never snaps back onto the plane
on the crossing tick. The audit checks every lock position on a 2 u lattice
inside the core: a clear hull position must exist within the distance the
plane can move laterally before it arrives.

## Biome sets

| biome | archetypes | spacing | prob |
|---|---|---|---|
| canyon | hoops, bouncing blocks | 260 | 0.8 |
| cave | hoops | 240 | 0.8 |
| crystal spires | spinning blades, irises, hoops | 260 | 0.8 |
| lava rift | geysers, pistons (presses), jaws | 240 | 0.85 |
| hoodoo desert | boulder shadows, bouncing blocks, orbiting shards | 220 | 0.85 |
| floating archipelago | mimic shards, orbiting shards, hoops | 260 | 0.8 |
| trench run | jaws, spinning blades | 200 | 0.9 |

Difficulty scales station density (`ADVERSARY_FACTOR`) and motion speed
(`ADVERSARY_SPEED`) per segment; see `difficulty.md`.

## Fairness rules (by construction)

- Segment 0 never places a body on the core; from `ADV_CORE_FROM` (segment 4)
  bodies may cross it.
- Wall and floor margins derive from the biome's own noise amplitudes.
- A body crossing the core does not spin and is clamped so a 3 u vertical
  lane remains for the hull (8 u wide, under 3 u tall). A vertical crosser is
  a press: it dips in from the roomier side and never passes through.
- No body moves faster than `ADV_MAX_STEP` (1.5 u per tick), and every body is
  at least 2 u deep along z so the two collision sub-steps cannot skip it.

## Fairness audit (by proof)

`pnpm adv:audit --seeds 1-8 --length 10000` decodes every station and checks
the speed bound, the z depth, a clear level-hull position inside the core at
every tick of the period, and that such positions stay reachable under a
lateral speed of 1 u per tick from every start phase. It then flies the
dodging pilot at full throttle and reports survival and DODGED counts. A short
version runs under Vitest.

## Collision and scoring

The plane's hull (centre sphere plus nose, tail, wing and top probes) is
tested against the nearer of rock and adversary at the tick's midpoint, its
end, and the exact crossing of a station plane. The nearer distance also feeds
proximity, the streak, CLOSE and THREADED. Crossing a station plane alive with
a body within `DODGE_DIST` pays the DODGED bonus (`scoring.md`).

## Rendering

One instanced mesh per shape, unlit in the biome accent and breathing toward
white over the period; a post-and-lintel frame on the walls fades in from
400 u so a station is telegraphed before its body is readable.
