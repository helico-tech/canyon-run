# CR-0012 evidence — loop, input, replay-driven headless run

- `tests/e2e/input.spec.ts` loads the real-time build with `?debug=1`, waits for
  ticks to advance, presses `S` (nose up) and checks `pitchRate > 0.2`, then
  `Shift` and checks the throttle rises. Both Playwright specs pass (10 s).
- `keydemo-replay.json` is a 240-tick replay recorded in Node: the pilot's
  mouse steering plus `ROLL_R`/`ROLL_L` key phases every 40 ticks.
  `node tools/headless/run.ts --replay … --frames 240 --every 40` replays it in
  the browser: all gates ok, the browser's final checksum equals Node's, and
  `sheet.png` shows the alternating banks (11 s for 240 frames).
