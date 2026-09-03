# CR-0044 evidence — lava geyser pads (2026-09-03)

Forced lava rift. Geysers rest for most of a 456-tick period, so the seeds
were chosen with a script that flies the pilot and reports each geyser's
phase at arrival (scratch `geyser-timing.ts`): seed 2 meets the geyser at
z 5211 at phase 0.51, the peak of its burst.

- `geyser-peak-segment-4.png` (`--seed 2 --skip 1960 --frames 160 --every 20`):
  from f80 (z 5133) the yellow column rises under its station frame; the
  pilot passes above it through the lane at the top of the core (f140, alive).
- `geyser-segment-0.png` (`--seed 6 --skip 240 --frames 140 --every 20`):
  an early geyser (z 614) erupting at phase 0.45 while it is still confined
  below the core; the frame and the rising block are visible at f60–f80.
- `geyser-peak-gate.json`: every gate ok, browser checksum equal to Node.

The first peak run failed only the HUD anchor gate because the cyan altitude
marker sat on the sampled border pixel; the gate now accepts the marker colour.
Audit: `pnpm adv:audit --seeds 1-8 --length 10000` ok; all 21 forced-biome
full-throttle flights alive.
