---
id: CR-0027
epic: EPIC-08
status: done
---
# CR-0027 Performance pass

**Goal.** Measure and record: ms per chunk, ms per slab, resident triangles and bytes, JS heap, worker load at 170 u/s, headless ms per frame; tune octaves or cell size if the worker exceeds 50 % of a core.

**Files.** `tools/terrain-census.ts`, `tools/headless/run.ts` (timing columns), `docs/context/performance.md`.

**Acceptance.** Numbers documented with the commands that produced them; any tuning change goes through `pnpm sim:regold` with a note; no fps gates in tests.

**Verification.** `docs/context/performance.md` committed with a date.

**Delivered notes.** The measured lever was a second worker (round-robin by
slab); a wasm port of the field remains the next step if wider halls or richer
detail are wanted. Numbers and commands in `docs/context/performance.md`; the
P2 issue on wide biomes is resolved.
