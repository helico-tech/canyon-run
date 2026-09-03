# CR-0041 evidence — player settings (2026-09-03)

Start screen at 640×360 (`?debug=1&seed=1`, headless Chromium), before and
after. Console error count was zero in both captures.

- `start-before.png`: seed and biome only.
- `start-after.png`: a settings row under the biome select: sensitivity
  slider with its value, invert Y and W/S throttle toggles.

The Playwright test "settings on the start screen do not start a run and
persist across a reload" (tests/e2e/lifecycle.spec.ts) covers the
interaction: changing a control leaves the start screen up and the phase
idle, and the values survive a reload.
