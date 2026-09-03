---
id: CR-0006
epic: EPIC-02
status: done
---
# CR-0006 Chunk builder with baked colours

**Goal.** `buildChunk(seed, cx, cy, cz)` returns a coloured, chunk-local mesh or `null`, with the shell skip and the per-chunk feature gather.

**Files.** `src/terrain/chunk.ts` (`fillGrid`, `buildChunk`, `ChunkMesh`, `ChunkScratch`), `src/terrain/palette.ts` (canyon ramps as u8 stops, `rampLookup`), `src/terrain/colour.ts` (per-face colour rule from spec §6.3), tests, `docs/domain/terrain-colour.md`.

**Acceptance.**
- Empty chunks (deep rock or deep air) return `null` after the base pass only.
- Output is identical bytes across two calls and independent of prior calls (no scratch leakage).
- A 10-slab census on seed 1 stays within budget: ≤ 12 000 tris per chunk; per-slab totals logged.
- Neighbouring chunks share bit-identical boundary vertices in world space.

**Verification.** `pnpm check`; `tools/terrain-census.ts` prints tris per slab and ms per chunk (numbers go into `docs/context/performance.md`).
