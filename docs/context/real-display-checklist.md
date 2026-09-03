# Real-display verification checklist

Everything in this repository was verified headless on a VM without a GPU
(SwiftShader, 640×360, 25–45 ms per frame). The items below need a person at
a machine with a display and a GPU; they take about five minutes. Record the
outcome in `docs/issues/2026-09-03-verify-real-gpu-and-pointer-lock.md`.

Already verified headless, so not repeated here: keyboard input reaches the
sim and the loop runs in real time (`tests/e2e/input.spec.ts`); the pointer
lock is requested with `unadjustedMovement` when available and falls back
otherwise (`src/app/pointerLock.ts`); Esc releases it through the
`pointerlockchange` listener, which also drops held keys; the sim, replays
and chunk output are bit-identical across Chromium, Firefox, Node and the
wasm field.

## Steps

1. Open https://helico-tech.github.io/canyon-run/?debug=1 in Chrome or Firefox
   at 1920×1080 (or `pnpm dev` and open the printed URL with `?debug=1`).
2. Click to fly. The top-left readout shows the frame rate. Expect a steady
   60 fps (or the display's rate) after the first two seconds. Below 55 fps,
   note the GPU model and the browser.
3. In the console run `__game.chunkStats()`. Expect roughly 150–250 k
   resident triangles and `wasmSlabs` equal to `slabs` after a few seconds.
4. Mouse feel: the plane should follow small hand movements without lag; a
   fast flick should roll it through 90° in about half a second. If it feels
   too twitchy or too slow, use the start-screen sensitivity slider first;
   only if the whole range (0.5–2×) is wrong, change `MOUSE_SENS` in
   `src/sim/constants.ts` and regold (`pnpm sim:regold`).
5. Auto-level: release the mouse for a second; the horizon should settle
   level without oscillating.
6. Press Esc: the cursor returns, the plane keeps flying straight, and the
   start of the next click re-locks the mouse. Alt-tab away and back: no key
   stays stuck.
7. Turn the sound toggle off and on: the engine drone and wind follow the
   throttle; a blip sounds on each callout.

## Outcome

Append a dated "Resolution" note to the issue with the GPU, browser, the
frame rate observed, and any constant you changed, then resolve it with
`node scripts/issues.ts resolve … --work CR-0047 --commit <sha>`.
