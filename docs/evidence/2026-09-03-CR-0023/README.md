# CR-0023 evidence — speed cues

Two replays recorded on seed 2 (`node src/cli/replay.ts run --throttle idle|full`)
and rendered headless (`node tools/headless/run.ts --replay … --frames 240 --every 60`),
frame 180 of each:

- `full-throttle.png` (170 u/s): streak tube, wider field of view, stronger
  vignette, camera lean in the turn, multiplier x2.0.
- `idle.png` (50 u/s): no streaks, narrow view, multiplier x0.4.

Both runs pass all gates; the sim checksums are unchanged (render-only change);
golden frame hashes regenerated because the visuals changed deliberately.
