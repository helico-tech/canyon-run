---
id: CR-0004
epic: EPIC-02
status: todo
---
# CR-0004 Canyon density field

**Goal.** `density(seed, x, y, z)` and `spine(seed, z)` for the canyon biome with features and the guaranteed core tube.

**Files.** `src/terrain/spine.ts`, `src/terrain/field.ts` (`baseDensity`, `density`, `FieldParams`, canyon params as the single v1 parameter set), `src/terrain/features.ts` (pillar, boulder, arch SDFs, hashed placement, `gatherFeatures(seed, aabb)`), tests, `docs/domain/terrain-field.md`.

**Interfaces.** `spine(seed, z) → { cx, floorY, ceilY, coreY, hw }`; `density(seed, x, y, z) → number` (`>0` rock); `densityWithFeatures(seed, x, y, z, features)` for the chunk path; `SHELL_BOUND` constant.

**Acceptance.**
- Property: for 2 000 random `(seed, z)`, the core is air and the roof is rock.
- Determinism: identical bits across two evaluations; per-chunk gathered features equal the global gather at every sample within 8 u of the surface (one chunk).
- No banned math. Values at integer sample positions are never NaN.

**Verification.** `pnpm check`; `docs/domain/terrain-field.md` documents formulas and v1 parameters.
