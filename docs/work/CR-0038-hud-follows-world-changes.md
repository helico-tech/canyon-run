---
id: CR-0038
epic: EPIC-05
status: done
---
# CR-0038 HUD probe and seed label follow every world change

**Goal.** Close issue `2026-09-03-hud-probe-stale-after-test-restart`: only
the start-screen path rebuilt the HUD probe and seed label, so a restart
through the test API (or any other path) left the glows and label on the
previous world.

**Files.** `src/app/game.ts` (`onWorldChange` fired by `restart` whenever
seed or mode changes), `src/app/main.ts` (registers `applySeed` once instead
of calling it from the start-screen path), `tests/e2e/lifecycle.spec.ts`.

**Acceptance.**
- After `__game.restart(2)` on a page loaded with seed 1 the seed label reads
  the new seed and the run steps in the new world.

**Verification.** The e2e test failed before (label stayed on seed 1) and
passes after; `pnpm check` green; Playwright suite green.
