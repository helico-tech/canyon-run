---
id: CR-0044
epic: EPIC-10
status: done
---
# CR-0044 Lava geyser pads that erupt on a rhythm

**Goal.** Close issue `2026-09-03-adversary-geyser-pads`: a column that rests
in the lava floor and erupts once per period, telegraphed by the colour pulse
that peaks with the burst.

**Files.** `src/sim/adversaries.ts` (`MOTION_ERUPT`, archetype 8, the
`erupt` envelope, placement: rest 1 u above the floor, peak just below the
core before segment 4 and just below a 3 u lane at the top of the core after,
period lengthened so the rise stays under `ERUPT_MAX_STEP` = 0.9 u per tick),
`src/terrain/biomes/lava.ts` (set [8, 2, 5]), tests, `docs/domain/adversaries.md`,
goldens regenerated.

**Acceptance.**
- At rest the column's top sits 1 u above the floor; at the peak its top
  stays below the core (segment < 4) or below the lane (segment ≥ 4).
- It rests for more than 60 % of the period and never rises faster than
  0.9 u per tick, under the audit's 1 u per tick lateral bound.
- The audit passes for the forced lava rift and the dodging pilot survives.

**Verification.** Tests failed before (no such motion) and pass after;
`pnpm check` green after regold; headless sheet in `docs/evidence/2026-09-03-CR-0044/`.
