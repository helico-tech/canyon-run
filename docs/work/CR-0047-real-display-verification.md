---
id: CR-0047
epic: EPIC-08
status: done
---
# CR-0047 Real-display verification: debug FPS readout and checklist

**Goal.** Make the one issue that needs a person with a display
(`2026-09-03-verify-real-gpu-and-pointer-lock`) a five-minute task: a
frame-rate readout in debug mode and a step-by-step checklist, with the
headless-verified parts (keyboard path, lock request and release) listed so
they are not repeated.

**Files.** `src/app/hud.ts` (`createHud(parent, { debug })`, `.fps`
readout from an exponential average of the frame interval), `src/app/hud.css`,
`src/app/main.ts`, `docs/context/real-display-checklist.md`, the issue's
progress note, `tests/e2e/lifecycle.spec.ts`.

**Acceptance.**
- With `?debug=1` the readout shows "N fps" once flying; without it the
  element stays hidden.
- The checklist names the URL, the expected numbers, the mouse-feel checks,
  the Esc and alt-tab checks, and where to record and resolve.

**Verification.** E2E test; `pnpm check` green. The issue stays triaged
until a person appends the outcome.
