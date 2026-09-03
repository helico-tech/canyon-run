---
id: CR-0019
epic: EPIC-06
status: done
---
# CR-0019 Biome: lava-rift

**Goal.** Lava rift: deep narrow slot W 30 H 140, horizontal strata, flat lava floor with orange band, rock islands, arch bridges; orange under-light, dark red fog.

**Files.** `src/terrain/biomes/lava-rift.ts` (params + feature list), `src/terrain/features.ts` (new SDFs if needed), `src/terrain/palette.ts` (ramps, fog, sky, light), registration in `src/terrain/biomes.ts`, tests, `docs/domain/biomes.md` section.

**Acceptance.**
- Core tube stays air through the biome and both blends (property test over z).
- Triangle budget: ≤ 12 000 per chunk, slab totals logged; feature placement is hash-only.
- A headless run whose seed puts this biome in segment 1 produces a sheet the agent reviews for the intended look; committed under `docs/evidence/`.
- Existing goldens still pass (canyon segments unchanged).

**Verification.** `pnpm check`, headless sheet, goldens.

**Delivered notes.** No new field capabilities were needed: the rift is
parameters only (flat ridge stretch for horizontal strata, near-vertical
profile, flat floor, big boulders as islands, frequent arches as bridges).
The lava glow comes from the hemisphere sky colour, which lights up-facing
faces. Goldens regenerated (SIM_VERSION 0.1.4). Evidence in
`docs/evidence/2026-09-03-CR-0019/`.
