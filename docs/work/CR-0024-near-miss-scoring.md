---
id: CR-0024
epic: EPIC-07
status: todo
---
# CR-0024 Near-miss events and proximity streak

**Goal.** Deterministic score events inside the tick: CLOSE (d < 3 u for ≥ 5 ticks then rising, sf > 0.5) 250, SO CLOSE (d < 1.5 u) 750, THREADED (two opposite probes < 6 u) 500; streak multiplier with 45-tick grace; HUD callouts.

**Files.** `src/sim/events.ts` (integer counters in `SimState`, cooldown 36 ticks), `src/sim/state.ts` (new fields hashed), `src/sim/step.ts`, `src/app/hud.ts` (callouts), tests with constructed geometry (teleport next to a wall), `docs/domain/scoring.md`.

**Acceptance.** Events reproduce in replays (checksum covers them); goldens regenerated deliberately; a test flies the pilot past a pillar and asserts a CLOSE event.

**Verification.** `pnpm check`, `pnpm test:e2e`.
