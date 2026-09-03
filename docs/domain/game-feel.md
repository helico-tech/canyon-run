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

## Death sequence (CR-0025)

Ticks keep counting while the plane is dead, so the timeline is sim-driven:

| t since death | Effect |
|---|---|
| 0 | white flash (0.9 → 0 over 120 ms), 48 shards burst from the crash point (plane velocity + 10–40 u/s, gravity 20, 1.2 s life, hashed from seed and tick), canvas desaturates over 0.5 s |
| 0–90 ms | hitstop: the camera holds the death pose |
| 90 ms → | the camera drifts along the last velocity with a 0.6 s decay and tumbles at 60–120°/s (hashed axis), decaying |
| 600 ms | the run-over panel (CR-0014) |

Near-miss callouts are in CR-0024.

## Audio (CR-0042)

Procedural WebAudio, no assets (`src/app/audio.ts`): two detuned sawtooths
through a lowpass for the engine (55–110 Hz and 200–900 Hz cutoff by speed
factor), looped white noise through a bandpass for wind (400–2500 Hz centre,
gain `0.6·t²` plus a proximity term), a 60 ms sine blip per score event (a
fifth higher for SO CLOSE and GATE, an octave for DODGED) and a 60 Hz thud on
death. The context is created outside test mode only, resumed on the click
that requests pointer lock, and silenced by the sound setting. Nothing feeds
back into the sim.
