# Game feel

Source: `src/render/{camera,streaks}.ts`, `src/app/hud.ts` (vignette). Research 05 §2.
Everything here is render-side: it reads the interpolated sim state and never
feeds back, so replays are untouched. Anything time-based uses the sim tick,
not the wall clock, so headless frames stay deterministic.

| Cue | Rule |
|---|---|
| Field of view | `66° + 18°·t_v` (vertical), `t_v` = speed factor |
| Speed streaks | 300 line segments in a 6–25 u tube around the camera, 20 u behind to 60 u ahead, length `0.15·speed`, alpha `0.45·t_v²`, hidden below `t_v = 0.2`, scrolled by `speed·dt` of sim time, layout seeded per run, colour 40 % biome accent |
| Vignette | CSS radial gradient, opacity `0.15 + 0.35·t_v` |
| Camera lean | rigid aim plus roll 3°, pitch 2°, yaw 2° at full commanded rate (from the filtered sim rates) |
| Shake | rotational noise sampled at 28 Hz from a hashed lattice of the tick: `0.25°·proximity² + 0.05°·t_v²`, clamped to 1.5° |

Death effects come in CR-0025; near-miss callouts in CR-0024.
