---
id: CR-0031
epic: EPIC-10
status: todo
---
# CR-0031 Adversary stations, motion laws, SDF collision and DODGED

**Goal.**

**Files.**

**Acceptance.**
-

**Verification.**
**Scope.** `src/sim/adversaries.ts` (constants, Station, decode, gather, poses, SDFs, hull tests, crossing), `AdversaryParams` on biomes (`NO_ADVERSARIES` for all biomes in this story), difficulty tables, step integration (near = max(rock, −adv), DODGED), HUD callout name, tests (motion vectors, decode rules, teleport collisions, DODGED once). Goldens unchanged because every biome still has prob 0.

**Acceptance.** Known-answer vectors pinned; a station never sits in a blend or before 600 u; teleporting into a body kills; a 5 u pass beside a hoop at its station pays DODGED exactly once; the tick cost with 5 active stations is logged.
