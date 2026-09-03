---
id: CR-0008
epic: EPIC-03
status: done
---
# CR-0008 Replay codec, validator CLI, golden replays

**Goal.** Record, encode, decode and validate replays; commit goldens.

**Files.** `src/sim/replay.ts` (`Replay`, `encodeRuns`, `decodeRuns`, `Recorder`, `simulateReplay`, `validateReplay` with the spec §5.4 verdicts), `src/sim/pilot.ts` (scripted deterministic pilot that follows the core tube using `spine` and a seeded PRNG), `src/cli/replay.ts` (`validate <file>`, `run --seed N --ticks T --out file`), `tests/replays/*.json`, `src/sim/golden.test.ts`, `src/sim/no-transcendentals.test.ts` (stub `Math.sin` and friends to throw, replay a golden), scripts `sim:validate`, `sim:regold`.

**Acceptance.**
- Codec round-trips 7 200 random input frames; RLE merges identical runs.
- `validateReplay` detects a one-count mouse mutation at the next checkpoint and reports its tick.
- Goldens for seeds 1, 2, 3 (1 800 ticks each, checkpoints every 60) pass; `pnpm sim:regold` rewrites them and bumps `SIM_VERSION`, refusing on a dirty tree.
- The stubbed-Math test passes.

**Verification.** `pnpm check`; `node src/cli/replay.ts validate tests/replays/seed-1.json` exits 0.
