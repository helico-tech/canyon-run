---
id: CR-0040
epic: EPIC-06
status: done
---
# CR-0040 Biome gate reads as a level-up

**Goal.** Close issue `2026-09-03-gate-frame-visibility`: the gate was two
3 u pillars and a lintel that read only as a palette change.

**Files.** `src/terrain/features.ts` (`GATE_RADIUS` 5, an accent-coloured
sill across the floor between the pillars inside `gateSD`), sim goldens and
the SwiftShader render golden regenerated (the field changed at every gate).

**Acceptance.**
- The gate reads as a frame with a threshold from at least 150 u out in the
  headless sheet, in the next biome's accent.
- The core stays clear: the pilot survival tests and the audit still pass.

**Verification.** Before/after sheets in `docs/evidence/2026-09-03-CR-0040/`;
`pnpm check` green after `pnpm sim:regold` and `pnpm headless:golden`.
