---
id: CR-0020
epic: EPIC-06
status: todo
---
# CR-0020 Biome: hoodoo-desert

**Goal.** Hoodoo desert: wide low hall W 90 H 100, receding walls, hoodoos (stepped capsules), rounded mesas, boulders; warm noon palette, roof hidden by warm fog.

**Files.** `src/terrain/biomes/hoodoo-desert.ts` (params + feature list), `src/terrain/features.ts` (new SDFs if needed), `src/terrain/palette.ts` (ramps, fog, sky, light), registration in `src/terrain/biomes.ts`, tests, `docs/domain/biomes.md` section.

**Acceptance.**
- Core tube stays air through the biome and both blends (property test over z).
- Triangle budget: ≤ 12 000 per chunk, slab totals logged; feature placement is hash-only.
- A headless run whose seed puts this biome in segment 1 produces a sheet the agent reviews for the intended look; committed under `docs/evidence/`.
- Existing goldens still pass (canyon segments unchanged).

**Verification.** `pnpm check`, headless sheet, goldens.
