---
id: CR-0045
epic: EPIC-10
status: done
---
# CR-0045 Reactive adversaries: boulder shadow and mimic lock onto the plane

**Goal.** Close issues `2026-09-03-adversary-boulder-shadow` and
`2026-09-03-adversary-mimic` with one mechanism: a body that mirrors the
plane's cross-section position while far, locks onto it the first tick the
plane is within `closeDist`, and then holds, so the plane must move at least a
hull height away in the remaining run-up.

**Files.** `src/sim/state.ts` (`advLockId`, `advLockX`, `advLockY`, hashed),
`src/sim/adversaries.ts` (`MOTION_AIM`, archetypes 9 boulder slab and 10
mimic shard, `Aim` input to `advPoseAt`, `lockAim` on the scratch, placement
from segment 4 with the vertical-lane clamp), `src/sim/step.ts` (lock before
poses), `src/sim/pilot.ts` (unlocked bodies are nothing to dodge yet),
`src/sim/adversaryAudit.ts` (for every lock position a clear hull position
within the plane's reach before arrival), renderer and test API pass the aim
through, `src/terrain/biomes/hoodoo.ts` [9, 1, 4], `archipelago.ts` [10, 4, 3],
tests, `docs/domain/adversaries.md`, goldens regenerated.

**Acceptance.**
- Before the lock the body's pose equals the plane's clamped position; the
  lock happens on exactly one tick at or inside `closeDist` and the pose then
  equals the locked position.
- The audit passes for an arena with every archetype over 9000 u and for
  seeds 1–8 in auto mode; the dodging pilot survives seeds 1–8 and every
  forced biome.

**Verification.** Tests failed before (no such motion) and pass after;
`pnpm check` green after regold; headless sheet in `docs/evidence/2026-09-03-CR-0045/`.
