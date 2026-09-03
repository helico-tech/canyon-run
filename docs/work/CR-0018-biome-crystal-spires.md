---
id: CR-0018
epic: EPIC-06
status: todo
---
# CR-0018 Biome: crystal-spires

**Goal.** Crystal spires: canyon slot W 36 H 120, smoother basalt walls, hex-prism crystals on floor and walls tilted from a 16-entry table, neon crystal faces on dark rock, magenta rim light.

**Files.** `src/terrain/biomes/crystal-spires.ts` (params + feature list), `src/terrain/features.ts` (new SDFs if needed), `src/terrain/palette.ts` (ramps, fog, sky, light), registration in `src/terrain/biomes.ts`, tests, `docs/domain/biomes.md` section.

**Acceptance.**
- Core tube stays air through the biome and both blends (property test over z).
- Triangle budget: ≤ 12 000 per chunk, slab totals logged; feature placement is hash-only.
- A headless run whose seed puts this biome in segment 1 produces a sheet the agent reviews for the intended look; committed under `docs/evidence/`.
- Existing goldens still pass (canyon segments unchanged).

**Verification.** `pnpm check`, headless sheet, goldens.
