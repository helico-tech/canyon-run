# CR-0030 evidence — biome selector

- `start-screen-selector.png`: the start screen with the biome select set to
  trench-run; the URL hash becomes `#seed=0000-0001&biome=trench-run` and the
  HUD seed label shows the mode.
- `seed1-forced-trench.png`: `pnpm headless -- --seed 1 --biome trench --skip 840 --frames 120`
  — seed 1 (auto mode gives crystal spires first) now runs the trench in
  segment 1; all gates ok, browser checksum equals Node's with the mode.
- `seed1-canyon-only.png`: `--biome canyon` keeps every segment canyon.

A real-page flow (select trench, click to fly) reaches `biomeMode 6`, ticks
advance and the plane, uncontrolled, crashes at tick 232 with zero page errors.
Fixed on the way: the app awaited the initial chunk ring before starting the
loop, and switching biome disposed that ring's client, so the loop never
started; the loop now starts at once and disposing a client releases waiters.
The state checksum now also covers the near-miss counters (their CR-0024
inclusion had silently missed) and the biome mode; goldens regenerated
(SIM_VERSION 0.1.10, scores unchanged).
