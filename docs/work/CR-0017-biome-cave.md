---
id: CR-0017
epic: EPIC-06
status: done
---
# CR-0017 Biome: cave

**Goal.** Cave: elliptic tube W 28 H 55, stalactites and stalagmites, columns, side tunnels; dark palette with cyan bands, dense dark fog, cool light.

**Files.** `src/terrain/biomes/cave.ts` (params + feature list), `src/terrain/features.ts` (new SDFs if needed), `src/terrain/palette.ts` (ramps, fog, sky, light), registration in `src/terrain/biomes.ts`, tests, `docs/domain/biomes.md` section.

**Acceptance.**
- Core tube stays air through the biome and both blends (property test over z).
- Triangle budget: ≤ 12 000 per chunk, slab totals logged; feature placement is hash-only.
- A headless run whose seed puts this biome in segment 1 produces a sheet the agent reviews for the intended look; committed under `docs/evidence/`.
- Existing goldens still pass (canyon segments unchanged).

**Verification.** `pnpm check`, headless sheet, goldens.

**Delivered notes.** Added field capabilities that are inert at zero for the
canyon: `tubeness` (elliptic cross-section), `stalactiteAmp`/`stalagmiteAmp`
spikes, and carved side tunnels (`FEATURE_TUNNEL`). Hemisphere light colours
are now explicit per biome (`ambient`, `ground`) because deriving them from a
near-black cave sky left no light. Goldens regenerated (segment 1 is now a
cave); canyon frame hashes unchanged. Evidence in `docs/evidence/2026-09-03-CR-0017/`.
