---
id: CR-0021
epic: EPIC-06
status: todo
---
# CR-0021 Biome: floating-archipelago

**Goal.** Floating archipelago: tall hall W 80 H 170, floor far below, floating ridged ellipsoids on 3D cells, thin hanging chains, arches between rocks; pastel palette, bright fog.

**Files.** `src/terrain/biomes/floating-archipelago.ts` (params + feature list), `src/terrain/features.ts` (new SDFs if needed), `src/terrain/palette.ts` (ramps, fog, sky, light), registration in `src/terrain/biomes.ts`, tests, `docs/domain/biomes.md` section.

**Acceptance.**
- Core tube stays air through the biome and both blends (property test over z).
- Triangle budget: ≤ 12 000 per chunk, slab totals logged; feature placement is hash-only.
- A headless run whose seed puts this biome in segment 1 produces a sheet the agent reviews for the intended look; committed under `docs/evidence/`.
- Existing goldens still pass (canyon segments unchanged).

**Verification.** `pnpm check`, headless sheet, goldens.
