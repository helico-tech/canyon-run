---
id: CR-0015
epic: EPIC-05
status: done
---
# CR-0015 In-browser replay and cross-engine test

**Goal.** Every run is recorded; a replay file can be played back in the browser; Node and Chromium agree bit-for-bit.

**Files.** `src/app/replayPlayer.ts` (feeds decoded frames per tick, HUD badge), `src/app/game.ts` (`?replay=<url>` and `window.__replay`), run-over panel "copy replay JSON" button, `tests/e2e/cross-engine.spec.ts` (Node checksum vs `__game` checksum for goldens seed-1..3), `docs/context/replays.md`.

**Acceptance.**
- Playing back `tests/replays/seed-1.json` in the browser ends with the golden's `finalChecksum` and `finalScore`.
- Recorder output validates with the CLI (`node src/cli/replay.ts validate`).
- Cross-engine spec is part of `pnpm test:e2e`.

**Verification.** `pnpm test:e2e`.

**Delivered notes.** `?nogl=1` runs the sim with a null renderer so engines
without WebGL (headless Firefox here) can still replay goldens. Copy-to-
clipboard replaces a download button. Evidence in
`docs/evidence/2026-09-03-CR-0015/`.
