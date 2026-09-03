---
id: CR-0031
epic: EPIC-10
status: done
---
# CR-0031 Adversary stations, motion laws, SDF collision and DODGED

**Goal.**

**Files.**

**Acceptance.**
-

**Verification.**
**Scope.** `src/sim/adversaries.ts` (constants, Station, decode, gather, poses, SDFs, hull tests, crossing), `AdversaryParams` on biomes (`NO_ADVERSARIES` for all biomes in this story), difficulty tables, step integration (near = max(rock, −adv), DODGED), HUD callout name, tests (motion vectors, decode rules, teleport collisions, DODGED once). Goldens unchanged because every biome still has prob 0.

**Acceptance.** Known-answer vectors pinned; a station never sits in a blend or before 600 u; teleporting into a body kills; a 5 u pass beside a hoop at its station pays DODGED exactly once; the tick cost with 5 active stations is logged.

**Delivered notes.** `src/sim/adversaries.ts` implements stations, the seven
archetypes, trig-free motion (triangle, eased swing, 32-entry circle table,
approach-driven close), extruded 2D SDFs, the near list, hull tests with a
z-crossing sub-step and DODGED. Every biome still has no adversaries, so
behaviour is unchanged apart from the new constants (goldens regenerated,
SIM_VERSION 0.1.11). Tests pin the primitives' bits, placement rules, the
core invariant before segment 4 with the speed cap, a kill by teleport and a
single DODGED payout.
