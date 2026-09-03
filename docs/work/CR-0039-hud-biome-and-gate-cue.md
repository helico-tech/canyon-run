---
id: CR-0039
epic: EPIC-05
status: done
---
# CR-0039 HUD shows the biome and an upcoming-gate countdown

**Goal.** Close issue `2026-09-03-hud-biome-name`: the HUD did not say which
biome the player was in or how far the next gate was, so difficulty steps were
hard to read.

**Files.** `src/app/hudProbe.ts` (view carries the segment's biome name and
the distance to the next boundary inside `GATE_CUE_RANGE` = 400 u),
`src/app/hud.ts` (biome label above the seed, centred gate countdown),
`src/app/hud.css`, `src/app/hudProbe.test.ts`, `docs/domain/hud.md`.

**Acceptance.**
- The label names the current segment's biome and switches at the boundary.
- "gate in N u" appears within 400 u of a boundary and disappears after it.

**Verification.** Probe test failed before, passes after; `pnpm check`
green; headless before/after sheets across the first gate in
`docs/evidence/2026-09-03-CR-0039/`, all gates ok.
