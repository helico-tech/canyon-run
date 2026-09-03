---
id: CR-0012
epic: EPIC-05
status: todo
---
# CR-0012 Game loop and input

**Goal.** Playable in a browser: fixed-step loop, keyboard and pointer-lock mouse, interpolated camera.

**Files.** `src/app/loop.ts` (accumulator, ≤ 5 ticks, prev/cur snapshots), `src/app/inputSampler.ts` (latched keys, integer mouse deltas, key map), `src/app/pointerLock.ts`, `src/app/game.ts` (owns sim, recorder, terrain client, renderer; `start(seed)`, `restart()`), `src/app/main.ts`, tests for `InputSampler` and the accumulator (pure), `docs/domain/controls.md`.

**Acceptance.**
- Keys W/S pitch, A/D roll, Q/E yaw, Shift/Ctrl thrust; mouse X roll, mouse Y pitch under pointer lock; Esc releases.
- The loop never calls `step` with wall-clock data; ticks per frame capped; tab-switch pause clamps the accumulator.
- Headless: `__game.setInput` + `step` drive the same code path as the loop.
- Playwright smoke: page loads, click starts, `keyboard.down('KeyW')` changes pitch in `__game.state()`.

**Verification.** `pnpm check`, `pnpm test:e2e`, headless sheet in `docs/evidence/2026-09-03-CR-0012/`.
