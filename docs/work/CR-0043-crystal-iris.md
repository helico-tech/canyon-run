---
id: CR-0043
epic: EPIC-10
status: done
---
# CR-0043 Crystal iris: a breathing ring in the spires

**Goal.** Close issue `2026-09-03-adversary-crystal-iris`: a ring in the
spires whose radius breathes, so the plane must be centred when it is tight.

**Files.** `src/sim/adversaries.ts` (`MOTION_PULSE`, archetype 7, `len2`
closed radius, pose `radius`, ring distance by pose radius, placement:
closed still clears the core before segment 4 and later still fits the level
hull), `src/sim/adversaryAudit.ts` (radius change counts toward the speed
bound), `src/render/adversaries.ts` (torus scaled by the pose radius),
`src/terrain/biomes/spires.ts` (set [0, 7, 3]), tests, `docs/domain/adversaries.md`,
goldens regenerated.

**Acceptance.**
- The pose radius spans [`len2`, `len`] over a period (to within the tick
  quantisation), and the core centre keeps a clear level hull at every tick.
- Before segment 4 the closed opening still clears the core by 2 u.
- The audit passes for the forced spires on seeds 1–3 and the dodging pilot
  survives them.

**Verification.** Tests failed before (no such motion) and pass after;
`pnpm check` green after regold; headless sheet in `docs/evidence/2026-09-03-CR-0043/`.
