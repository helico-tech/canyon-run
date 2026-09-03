# CR-0014 evidence — start screen, death and run-over panel

Captured with the real-time build (`?debug=1&seed=1`, 640×360):

- `start-screen.png`: seed field, best score line, controls, "click to fly".
- `run-over.png`: after teleporting the plane 200 u into the wall the sim
  freezes, the HUD shows CRASHED, and 600 ms later the panel lists score,
  time, distance, top speed, best and the seed.

`tests/e2e/lifecycle.spec.ts` drives the same flow and presses `R`, asserting
the panel hides, the phase returns to running, the tick counter restarts and
no page errors were raised.
