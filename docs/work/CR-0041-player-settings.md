---
id: CR-0041
epic: EPIC-05
status: done
---
# CR-0041 Player settings: sensitivity, invert Y, throttle on W/S

**Goal.** Close issue `2026-09-03-player-settings`: sensitivity, invert Y
and a W/S throttle map, persisted, without touching the sim or the replay
format (ADR 0008).

**Files.** `src/app/settings.ts` (shape, defaults, guard),
`src/app/inputSampler.ts` (scale and flip before rounding; alternate key
map), `src/app/storage.ts` (`settings`/`setSettings`), `src/app/screens.ts`
and `screens.css` (controls on the start screen), `src/app/main.ts`,
tests in `inputSampler.test.ts` and `storage.test.ts`, `docs/adr/…0008…`,
`docs/domain/controls.md`, README.

**Acceptance.**
- Sensitivity 1.5 turns a 10-count move into 15; invert Y flips the sign;
  the W/S map produces throttle bits for W/S and pitch bits for Shift/Ctrl.
- Settings survive a reload and wrong-shaped stored values fall back to the
  defaults.
- The start screen shows the controls and clicking them does not start a run.

**Verification.** Unit tests failed before (no module) and pass after;
`pnpm check` green; before/after start-screen screenshots with a clean console
in `docs/evidence/2026-09-03-CR-0041/`.
