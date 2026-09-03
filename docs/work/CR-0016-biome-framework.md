---
id: CR-0016
epic: EPIC-06
status: done
---
# CR-0016 Biome framework, sequencing, blending, palettes

**Goal.** One field, many parameter sets; segments and blends along z; render fog/sky/light follow the biome.

**Files.** `src/terrain/biomes.ts` (`BiomeId`, `BiomeParams`, `CANYON`, `biomeAt(seed, z)`, `mixParams(a, b, t)` lerping amplitudes and radii, never frequencies), `src/terrain/field.ts` (takes `FieldParams` from `biomeAt`), `src/terrain/palette.ts` (per-biome ramps, fog, sky, light), `src/render/atmosphere.ts` (fog/sky/light lerp by plane z), tests: blend keeps the core air; `mixParams(a, a, t) = a`; segment sequence deterministic, `docs/domain/biomes.md`.

**Acceptance.**
- Segment layout: even canyon 1 200 u, odd special 2 400 u, blend 320 u.
- With only canyon registered, output is byte-identical to before this story (goldens unchanged).
- Fog, sky and light colours interpolate smoothly in headless frames across a boundary (sheet).

**Verification.** `pnpm check`, goldens pass, sheet in `docs/evidence/`.

**Delivered notes.** Blending evaluates both biome fields and lerps the
densities, then carves the mixed core tube, instead of mixing noise terms;
this is simpler and provably keeps the corridor open. Goldens and frame hashes
are unchanged (canyon-only output is identical). Chunk cost 12.9 ms per
candidate after the refactor.
