---
id: CR-0022
epic: EPIC-06
status: todo
---
# CR-0022 Biome gates and difficulty progression

**Goal.** A visible accent-coloured gate at every biome boundary with a guaranteed straight; width, feature density and speed floor scale with distance.

**Files.** `src/terrain/biomes.ts` (`difficulty(z)` curves applied in `mixParams`: width `55+45·exp`-style via per-segment literal table, feature probability, roughness), `src/terrain/features.ts` (gate: two pillars + lintel in the next biome's accent colour), `src/sim/constants.ts` (`SPEED_FLOOR_BY_SEGMENT` literal table; the sim's `MIN_SPEED` becomes a function of segment), `src/sim/step.ts` (GATE bonus when crossing a boundary), tests, `docs/domain/difficulty.md`.

**Acceptance.**
- Difficulty tables are literals (no `exp` at runtime); segment index from `floor(z / SEGMENT)` arithmetic.
- Gate has a clear 150 u straight with no features; the pilot survives through 5 boundaries on seeds 1–3.
- Goldens regenerated deliberately (`pnpm sim:regold`) with the version bump noted in the commit.

**Verification.** `pnpm check`, headless sheet at a boundary in `docs/evidence/`.
