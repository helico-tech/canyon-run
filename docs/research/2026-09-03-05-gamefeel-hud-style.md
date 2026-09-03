# 05 — Game feel, HUD, rendering style

Research note for the canyon flyer (cockpit view, endless marching-cubes canyon, flat-shaded, no textures).
Everything below is sized for one developer in a few days. Numbers are starting values, tuned in play.

Units: 1 world unit = 1 m. Plane body radius for collision ≈ 1.2 m. Reference canyon width W0 = 80 m.

## 0. What the references actually do (and what we take)

| Reference | What it does | What we take |
|---|---|---|
| Superflight | Arrow keys only, Space = instant reset. No thrust: a wingsuit that gains speed by diving. Score multiplier climbs x2/x3/x4 while you stay close to rock and resets when you drift away (players report an inconsistent 1-2 s buffer). Lump bonuses for "So Close" (+4000), "Awesome" (+2000), squeezing through gaps, and portals. Speed is sold by motion blur and wind audio, nothing else. Community complaint: flying slowly along a surface earns more than flying fast, so the multiplier "rewards patience". | Proximity as the core score lever, near-miss and gap callouts, seeds that are shareable text, restart under 300 ms. We fix the "slow is better" flaw by weighting score by speed, and we give the combo an explicit grace window. |
| Race the Sun | Constant forward speed, ship slows in shadow and when clipping objects. Regions of rising difficulty, each with a distinct look; collect 5 tris to raise the multiplier by one; boosts "raise the sun" (buy time). Minimal abstract shapes so nothing gets cluttered at speed. | Regions = biomes with a clear visual break, a speed floor that never lets you crawl, an uncluttered world. |
| AaAaAA!!! | "Hug" = near an obstacle (100 pts), "kiss" = skimming it (1000 pts). Two tiers with very different payouts. | Two-tier near miss: CLOSE and SO CLOSE. |
| Star Fox 64 corridor mode | Tunnel segments: on-rails forward motion, you dodge inside a cross-section, geometry rushes past on all four sides. | The canyon cross-section is the play area; walls on both sides plus a hard ceiling means threats on four sides. |
| Rez / Thumper / Tempest | Vector-clean silhouettes, one accent colour glowing against a dark or saturated ground, rhythm of features. | One accent colour per biome, used only for gates, boost, callouts and the proximity glow. No bloom needed when the accent is the only saturated thing on screen. |

Sense-of-speed rules from the game-feel articles: FOV widening is the cheapest and strongest cue; speed lines and edge blur must leave the centre clear; camera shake scales with speed but must stay small or it disorients; particles are emitted ahead and stream toward the camera.

**What makes Superflight feel fast**, in order of importance:

1. Angular optic flow = v / d. Speed only reads when d (distance to the nearest surface) is small. 80 m/s at 3 m from a wall is 27 rad/s of flow at the screen edge. 80 m/s at 40 m from everything feels like 20 m/s.
2. Feature size 2-4 x the player's size, spaced so you cross several per second. Small features close by, big features far away for parallax.
3. Narrow gaps: the "threading" moment where both sides are within a few metres at once.
4. Very little UI, instant restart, no cutscene between death and the next run.

Design consequence: difficulty and speed feel should come from width, feature density and proximity, not from unfair bend radii (see section 6).

## 1. Rendering style

### 1.1 Geometry and colour

- Marching-cubes output is emitted **non-indexed** (3 unique vertices per triangle) with a `color` attribute baked per face at chunk build time. This gives true flat shading and per-face colour for free; no `flatShading` derivative tricks needed, and the face normal is computed on the CPU while building. Cell size 2-3 m so the smallest feature is roughly 8 m.
- Per-face colour rule (CPU, chunk build), all inputs are the face centroid `c` and face normal `n`:
  ```
  h        = smoothstep(floorY, floorY + 45, c.y)              // 0 at floor, 1 near rim
  base     = mix(wallLow, wallHigh, h)
  strata   = 1 - 0.08 * (floor((c.y + noise1(c.x*0.02, c.z*0.02)*6) / 7) & 1)   // 7 m rock bands, wobbled
  if n.y >  0.55: base = mix(base, floorColor, 0.85)            // upward faces = floor / ledges
  if n.y < -0.30: base = base * 0.62                            // undersides / overhangs
  jitter   = hash(faceIndex) -> hue +-3 deg, value +-6 %        // mosaic so big faces don't merge
  color    = base * strata * jitter
  ```
  The strata bands and the per-face jitter are what make big flat polygons read as rock rather than plastic. Keep them subtle (values above).
- Biome blending is baked: within the 200 m blend band around a biome boundary, lerp the two palettes by world-z before applying the rule. No runtime recolour needed.

### 1.2 Lighting

- One `DirectionalLight` (sun), intensity 1.6, colour = biome `sun`. Direction: elevation 35 deg, azimuth 60 deg off the canyon's forward axis so the two walls are lit differently. That asymmetry is the main readability cue inside a canyon.
- One `HemisphereLight`, sky = biome `skyTop`, ground = biome `floor`, intensity 0.7.
- No shadow maps. Flat shading, fog and the two-wall asymmetry carry the depth cues; shadows would cost more than everything else combined.
- Material: `MeshLambertMaterial({ vertexColors: true })` on day one (three.js docs confirm `vertexColors` and `flatShading` on Lambert; with non-indexed geometry you don't even need the flag). Upgrade path: a 40-line `ShaderMaterial` that does Lambert + hemisphere + fog + a 4x4 Bayer dither, which is where optional lighting quantisation (toon steps) would live. Recommendation: **do not** quantise lighting on the terrain; faceting plus banding looks noisy. Dither the sky only (1.3).

### 1.3 Fog, sky, sun

- `FogExp2` with density 0.0045 (roughly 98 % fog at 450 m) or linear `Fog(near 60, far 450)`. Fog colour = biome `skyHorizon`. Chunk streaming must keep geometry loaded to at least fog-far + 100 m ahead so nothing pops.
- Sky: one inverted sphere (radius 900, `depthWrite: false`, follows the camera, drawn first) with a tiny `ShaderMaterial`:
  ```
  t     = smoothstep(-0.05, 0.45, dir.y)
  col   = mix(skyHorizon, skyTop, t)
  sun   = smoothstep(0.9985, 0.9995, dot(dir, sunDir))          // ~1.5 deg disc, hard edge
  halo  = pow(max(dot(dir, sunDir), 0), 64) * 0.35
  col   = mix(col, sunColor, sun) + sunColor * halo
  col  += (bayer4x4(gl_FragCoord.xy) - 0.5) / 48                // kills gradient banding
  ```
  Because the horizon colour equals the fog colour, terrain dissolves seamlessly into the sky and the chunk boundary is never visible. Setting `scene.background` to `skyHorizon` as well covers the frame before the dome draws.
- Speed cue in fog: fog-far shrinks from 450 m to 390 m as speed goes from floor to max (`far = 450 - 60 * t_v`). Any more than that hurts reaction time.

### 1.4 Screen-space speed effects (no post-processing in v1)

- **Speed streaks (3D)**: one `LineSegments` of 300 short segments placed in a tube 6-25 m around the camera, 20-60 m ahead, recycled behind. Length = 0.15 * v (m), alpha = 0.45 * t_v^2, coloured biome `accent` at 40 % mix with white. One draw call, parallax for free, and they disappear at low speed.
- **Vignette**: a fixed DOM div with `radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,a) 100%)`, opacity `0.15 + 0.35 * t_v`. Tint toward `accent` during boost.
- **Chromatic aberration**: only if a full-screen pass exists anyway. One `ShaderPass` sampling R/B at +-(0..3 px) radially, driven by boost. Cost is one extra full-screen draw. Skip in v1; the vignette tint plus FOV kick already reads as boost.
- **Bloom**: no. The accent colour is the only saturated thing on screen; it pops without it.

### 1.5 Biome palettes

Ordering is chosen so adjacent biomes swap hue families. Hex colours; `skyHorizon` is also the fog colour.

| # | Biome | skyTop | skyHorizon / fog | wallLow | wallHigh | floor | accent | sun |
|---|---|---|---|---|---|---|---|---|
| 1 | Sunset Mesa (warm desert) | `#2D1B4E` | `#FF9A5C` | `#8C2F39` | `#F2A65A` | `#5E2A3B` | `#2EE6D6` | `#FFE9A8` |
| 2 | Glacier Rift (ice) | `#0B1F4A` | `#9FE3FF` | `#1E5A8E` | `#E8FBFF` | `#123B66` | `#FF5C8A` | `#FFFFFF` |
| 3 | Toxic Jungle (acid/violet) | `#1A0A2E` | `#7CFF6B` | `#2A1450` | `#6A3AA8` | `#12081F` | `#FFEA00` | `#D8FF80` |
| 4 | Neon Abyss (night, Rez) | `#05010F` | `#2B0A5E` | `#120B33` | `#5B2BD1` | `#06031A` | `#00F0FF` | `#FF2BD6` |
| 5 | Coral Shallows (pastel) | `#1D6FA8` | `#FFD1E8` | `#FF6F91` | `#FFC75F` | `#C34A8A` | `#00E5A0` | `#FFF6D5` |
| 6 | Obsidian Forge (volcanic) | `#2A0F1A` | `#FF6A3D` | `#1A1418` | `#4A3B44` | `#FF3D00` | `#FFD23F` | `#FF8C42` |

Notes: Neon Abyss has a dark horizon, so raise its sun intensity to 2.2 and hemisphere to 0.9 or the walls turn to mud. Obsidian Forge uses the floor as the "lava" surface; keep floor faces flat-lit (multiply floor colour by 1.3 there) so it glows without emissive tricks.

## 2. Camera and game feel

Symbols: `v` speed (m/s), `v_min` current speed floor, `v_max` = 160, `t_v = clamp((v - v_min) / (v_max - v_min), 0, 1.15)` (above 1 only during boost), `d` distance to nearest surface.

### 2.1 Scale and speed

| Quantity | Value | Why |
|---|---|---|
| Canyon width (early / late) | 100 m / 55 m | 1.2 s to cross at cruise early, 0.5 s late |
| Canyon depth floor to rim | 85-110 m | rim must sit above the ceiling (see 5.3) |
| Ceiling height above floor | 70 m | inside the canyon, so you cannot skip the walls |
| Speed floor v_min | 45 -> 90 m/s over distance | never allows crawling for points |
| Cruise (throttle 1.0, no boost) | 160 m/s | |
| Boost | +40 m/s for 1.5 s, cooldown 4 s | |
| Dive bonus | `+ 20 * sin(-pitch)` m/s target (max +14 at -45 deg) | Superflight's dive feel, mild |
| Wall roughness amplitude | 6 -> 14 m, wavelength 25-60 m | features 2-4 x plane size |
| Pillars / arches | 10-25 m thick, first at 600 m | |
| Marching-cubes cell | 2-3 m | |

Rule of thumb for the terrain generator: at cruise the player should pass 3 or more distinct features per second, and something should be within 15 m at least half of the time.

### 2.2 Turn rates and bend radius

| Axis | Max rate | Input lag tau |
|---|---|---|
| Pitch | 100 deg/s | 70 ms |
| Roll | 220 deg/s | 50 ms |
| Yaw (Q/E) | 40 deg/s | 120 ms |
| Bank-to-turn coupling | yaw += 40 deg/s * sin(roll) | none (derived) |

Turn radius `r = v / omega_pitch`: 46 m at 80 m/s, 92 m at 160 m/s. Feed this back to the terrain generator as a hard constraint:

```
minBendRadius(d) = 1.5 * v_floor(d) / rad(100 deg) + width(d) / 2
```

so bends stay flyable at the speed floor. Difficulty must come from width and feature density, never from bends tighter than this.

### 2.3 Camera

- Cockpit camera is rigidly attached to the plane (no lag on aim, low latency is the priority), plus a small **lean** offset driven by input, so the view has weight without the controls feeling late: pitch input adds up to +-2 deg camera pitch, roll input adds +-3 deg extra bank, yaw +-2 deg. Critically damped spring, omega = 18 rad/s (settles in about 250 ms).
- FOV (three.js `fov` is vertical): `fov = 66 + 18 * t_v + kick`; `kick` = +6 deg on boost start, decays with tau 300 ms. Max ever 92. Smooth the target with tau 150 ms and call `updateProjectionMatrix` every frame (cheap).
- Near plane 0.5 m, far 800 m.
- Camera shake, all as rotational noise (simplex noise sampled at 28 Hz, never random per frame):

| Source | Amplitude | Notes |
|---|---|---|
| Speed | 0.05 deg * t_v^2 | barely perceptible, adds life |
| Proximity | 0.25 deg * (1 - d/8)^2 for d < 8 m | grows as you hug a wall |
| Boost | 0.30 deg while boosting | |
| Ceiling bounce | 1.0 deg impulse, tau 250 ms | |
| Death | 2.0 deg impulse | |

  Plus a positional shake of 0.05 m at proximity. Sum is clamped to 1.5 deg outside of death so it never spoils aim.

### 2.4 Cues summary (what fires when)

| Cue | Driven by |
|---|---|
| FOV | t_v (continuous), boost kick |
| Speed streaks alpha and length | t_v^2, v |
| Vignette opacity | t_v |
| Fog far | t_v (mild) |
| Proximity edge glow (HUD) | d and direction of nearest surface |
| Shake | see table |
| Callout text | score events |

## 3. HUD

Implementation: DOM elements absolutely positioned over the canvas, `pointer-events: none`. Bars use `transform: scaleX()` (no layout), text is updated at 15 Hz, bars and glows every frame. Reticle and horizon are one small inline SVG rotated with `transform`. Font: a monospaced system stack, all-caps, letter-spaced. No second WebGL canvas.

```
+------------------------------------------------------------------------------+
| [> REPLAY 00:12 ====------]                                        | CEIL  | |
|  (top-left, only while                                             |#######| |  <- red zone (top 12 m)
|   replaying an input log)            128 450                       |       | |
|                                       SCORE                        |       | |
|                                     x 2.4                          |   ^   | |  <- altitude marker
|                          (x1.0 grey -> x3.0 accent -> x3.8 white)  |       | |
|                                                                    |       | |
|            ~~~~~~~~~~~~~~ artificial horizon ~~~~~~~~~~~~~         | FLOOR | |
|                             [   .   ]                                        |
|                              reticle bracket = fixed centre                  |
|                              dot = virtual-stick deflection                  |
|                                                                              |
|                    +750  SO CLOSE                                            |
|                    (callouts rise 40 px and fade over 700 ms)                |
|                                                                              |
|  SPD  ########....  132          BOOST ###.            seed 7F3A-21C  [copy] |
|  (bottom-left)                                          best 208 900         |
+------------------------------------------------------------------------------+
  proximity: 4 edge-glow divs (L/R/T/B), accent -> red, opacity = (1 - d/8)^2
  vignette : full-screen radial overlay, opacity 0.15 + 0.35 * t_v
```

Elements and behaviour:

- **Score**: integer, thousands separated, top centre. Pulses scale 1.15 on each callout.
- **Multiplier**: `x{M_total}` with one decimal, colour lerps grey -> accent -> white. Blinks amber for 300 ms when the proximity streak drops.
- **Speed bar**: fill = t_v; segments so the floor is visible as an empty stub; number is m/s. Turns accent while boosting; boost cooldown as a small secondary bar.
- **Altitude / ceiling**: vertical bar on the right, floor at bottom, ceiling at top, red band = warning zone (top 12 m). The marker is the plane. Whole bar flashes and "CEILING" text pulses inside the zone.
- **Artificial horizon**: a 40 %-width line rotated by `-roll`, offset vertically by `pitch * 3 px/deg`, with small tick marks. Essential inside a tunnel where the real horizon is hidden.
- **Reticle**: fixed bracket at centre; a dot shows the current virtual-stick deflection so the player can see the mouse state (fairness cue).
- **Proximity warning**: the four edge glows, plus a short tick sound later. Direction comes from the terrain density gradient (see 5.1).
- **Seed**: bottom-right, mono, click-to-copy (the only element with pointer events). Also shown on the death screen.
- **Replay indicator**: top-left badge with elapsed time and a progress bar, only while a replay is running. Input is ignored while it shows (except R/N/Esc).
- **Callouts**: max 2 visible, newest on top. Text is the event name and the points.

## 4. Controls

### 4.1 Map

| Input | Action | Notes |
|---|---|---|
| Mouse X | roll | pointer-locked |
| Mouse Y | pitch | invert option, default: push forward = nose down |
| A / D, Left / Right | roll | keyboard, full deflection |
| W / S, Up / Down | pitch | keyboard, full deflection (W = nose down by default, `invertY` swaps) |
| Q / E | yaw | rare, small rate |
| Shift / Ctrl | throttle up / down | throttle target moves at 1.0 per second while held |
| Space | boost | 1.5 s, 4 s cooldown |
| R | restart same seed | works mid-run too (Superflight's Space reset) |
| N | new seed | |
| Esc | pause (browser also releases pointer lock) | |
| Click on canvas | request pointer lock and start | |

Alternative throttle on W/S is offered as a settings toggle ("throttle on W/S, pitch on mouse only") because mouse-only pitch players want W/S free; default stays pitch on W/S.

### 4.2 Mouse model: bounded virtual stick with auto-centre

Pointer lock deltas push a virtual stick; the stick relaxes to centre. This is FPS-mouselook feel with a hard cap on rate, so a flick gives a short turn and a held motion holds the turn.

```
per mouse event:   raw += movement * sens            // sens = 0.0045 deflection per px (full = ~220 px)
per sim tick:      raw  = clamp(raw, -1, 1)
                   raw *= exp(-dt / 0.12)             // auto-centre, tau 120 ms
                   stick = sign(raw) * pow(|raw| - dz, 1.4) / pow(1 - dz, 1.4)  for |raw| > dz else 0
                                                     // dead zone dz = 0.04, expo 1.4 for precision near centre
```

- Ignore mouse deltas of magnitude below 1 px per event (sensor jitter).
- Request pointer lock with `{ unadjustedMovement: true }` and fall back without it when the promise rejects; it removes OS acceleration where supported (limited availability per MDN).
- Gotchas from MDN: the request needs a user gesture, cannot be re-issued right after the user pressed Escape (needs a fresh click), and must be called before `requestFullscreen` if both are wanted. Use the same click to resume the AudioContext later.
- Sensitivity slider 0.5x-2x, invert Y, both in `localStorage`.

### 4.3 Keyboard model

Keys drive a target of +-1 per axis with linear ramps: attack 60 ms, release 50 ms. No auto-centre needed, the release ramp is it.

### 4.4 Combining and smoothing

```
deflection = clamp(stick + keys, -1, 1)              // both sources sum, keyboard can saturate
rateCmd    = deflection * maxRate[axis]
rate      += (rateCmd - rate) * (1 - exp(-dt / tau[axis]))   // tau: roll 50, pitch 70, yaw 120 ms
```

Total added latency at 60 Hz is about 3 frames on roll, which reads as weight rather than lag. Sim runs at a fixed 120 Hz with input sampled per tick (so the determinism work can log inputs per tick), rendering interpolates.

Optional assists, both default **on** because they make the cockpit view fair for new players and cost nothing for experts:

- Bank-to-turn: yaw rate += 40 deg/s * sin(roll). Rolling then pulling is the fast way round a bend, but a lazy bank still turns you.
- Roll auto-level: when |roll input| < 0.05, roll relaxes toward 0 at 45 deg/s (only below 60 deg of bank, so knife-edge flight stays possible).

### 4.5 Pace vs fairness checklist

- Keep sim-to-photon under 3 frames: fixed step, no extra render-queue buffering, `requestAnimationFrame` only.
- The reticle dot shows mouse state, so an unexpected turn is never a mystery.
- The proximity glow appears at 8 m, which at 160 m/s is 50 ms of warning. That is deliberately tight; the altitude bar and horizon give the slower cues.
- Respawn in the same place is not needed; the restart is a fresh run on the same seed. A run that ends at 3 s must take under 1 s to try again.

## 5. Death and scoring loop

### 5.1 Proximity and collision from the density field

The terrain is a marching-cubes surface of a density function `rho(p)` (negative inside rock). Reuse it:

```
d      = |rho(p)| / |grad rho(p)|        // signed-distance estimate, 5 noise samples (centre + 4 finite differences)
dir    = -normalize(grad rho(p))          // points toward the nearest rock: drives the edge glow
```

Sample at the nose and both wingtips (3 points) per tick. Collision = `rho <= 0` at any point or `d < 1.2 m` at the nose. This costs 15 noise evaluations per tick and needs no raycasts, no BVH. Cross-team note for terrain: expose `density(p)` and `gradient(p)` from the world module in the same coordinates the mesh uses.

If the density field is not available at runtime, the fallback is 6 raycasts (up, down, left, right, two forward-diagonals) against the 2-3 nearest chunk meshes using three-mesh-bvh. Slower and more code; avoid.

### 5.2 Score

```
M_v      = 0.5 + 2.5 * t_v^2                       // x0.5 at the floor, x3.0 at cruise, x3.8 boosting
prox     = clamp(1 - d / 10, 0, 1)                 // 0 beyond 10 m, 1 touching
streak   = time continuously within 10 m, with a 0.75 s grace before it resets
M_p      = 1 + prox + min(streak / 2, 1.0) * 0.5   // x1 .. x2.5
M_total  = M_v * M_p                               // shown on the HUD, x0.5 .. x9.5
score   += 10 * M_total * dt                       // points per second
```

Slow flying earns little because M_v is quadratic in speed. Hugging a wall doubles the rate. Going high toward the ceiling earns nothing because d is large there and the ceiling zone halves M_p (5.3).

Event bonuses (rate-limited to one per 0.6 s, scaled by M_v, pushed as callouts):

| Event | Condition | Points |
|---|---|---|
| CLOSE | d < 3 m for at least 80 ms, then d rises again, v > 0.5 v_max | 250 |
| SO CLOSE | same with d < 1.5 m | 750 |
| THREADED | two opposite samples both < 6 m at once (gap) | 500 |
| GATE | passed a biome gate | 1000 |
| BOOST RUN | boost fully spent without a CLOSE reset | 300 |

A "hit" (collision) cancels any event pending in that tick. Callout text is the event name, then the points.

### 5.3 Ceiling: warn, push, bounce, never kill

- Warning zone: 12 m below the ceiling. HUD altitude bar goes amber then red, "CEILING" pulses, top edge glows, `M_p` is clamped to 0.5 while inside. Pitch-up authority fades to 40 % across the zone.
- At the ceiling: `a_y -= 25 * (1 + overshoot / 4)` m/s^2. If `v_y > 0` at the plane: `v_y = -0.4 * v_y` (bounce), 1 deg shake impulse, camera dips 0.3 m for 150 ms.
- Visual: a translucent flat-shaded plane at ceiling height in the biome accent, alpha fades in from 0 at 30 m below to 0.35 at 0 m, with a slowly scrolling stripe pattern done in the fragment shader (no texture). Only drawn when the player is within 35 m of it.
- Terrain constraint: canyon rims are at least 15 m above the ceiling everywhere, so "fly over the wall" is impossible.

### 5.4 Death sequence (timings from the collision tick)

| t | What happens |
|---|---|
| 0 ms | hitstop: sim frozen 90 ms, render continues. White flash div 0.9 -> 0 over 120 ms. 2 deg shake impulse. |
| 0 ms | 48 flat-shaded shards (triangles, 0.3-1.2 m, plane colour and accent), velocities 10-40 m/s + the plane's velocity, gravity 20 m/s^2, lifetime 1.2 s, one `InstancedMesh`. |
| 90 ms | camera keeps the forward velocity, decays to 0 over 600 ms with a random tumble (60-120 deg/s). CSS `filter: saturate(0.4)` on the canvas over 500 ms. |
| 600 ms | score panel slides in. Sim state stays visible behind it. |
| any time after 600 ms | R = same seed, N = new seed, Enter = same seed. Restart clears the panel, resets the sim, and must finish in under 300 ms: keep the chunk cache for the current seed alive across restarts, and pre-warm the first 600 m of a new seed while the panel is showing. |

Score panel:

```
+--------------------------------------------+
|                RUN OVER                    |
|                                            |
|            128 450   NEW BEST              |    <- "NEW BEST" flashes accent, else "best 208 900"
|                                            |
|   time      0:47.3    top speed  176 m/s   |
|   distance  6 120 m   avg speed  130 m/s   |
|   peak x    7.8       near misses   23     |
|   gates     2         biome   Neon Abyss   |
|                                            |
|   seed  7F3A-21C   [copy]                  |
|                                            |
|   [R] fly again    [N] new canyon          |
+--------------------------------------------+
```

### 5.5 Persistence (localStorage, all reads and writes in try/catch)

| Key | Value |
|---|---|
| `canyon.best` | `{ score, seed, date }` |
| `canyon.best.<seed>` | best on that seed |
| `canyon.lastSeed` | to offer "again" on load |
| `canyon.runs` | last 10 run summaries (for a future stats screen) |
| `canyon.settings` | `{ sens, invertY, throttleOnWS, assists }` |

Seed format: 7 hex characters displayed as `XXXX-XXX`, typed or pasted into the start screen, also readable from the URL hash (`#seed=7F3A21C`) so a link shares a canyon.

## 6. Difficulty progression

All curves are functions of distance `D` (m) along the canyon, with soft asymptotes so late runs stay possible.

| Parameter | Curve | Early -> late |
|---|---|---|
| Speed floor `v_min` | `45 + 45 * (1 - exp(-D / 4000))` | 45 -> 90 m/s |
| Mean width | `55 + 45 * exp(-D / 5000)`, +-25 % per segment | 100 -> 55 m |
| Feature density | `0.3 + 0.7 * (1 - exp(-D / 3500))` | 30 % -> 100 % of the generator's max |
| Roughness amplitude | `6 + 8 * (1 - exp(-D / 4000))` | 6 -> 14 m |
| Pillars, arches | from 600 m; caves and overhangs from 2500 m | |
| Min bend radius | `1.5 * v_min / rad(100 deg) + width / 2` | ~90 -> ~105 m (gets gentler as speed rises, by design) |

Biomes: every 2400 m (about 25-30 s at typical speeds), order drawn from the seed with the constraint that consecutive biomes differ in hue family (the palette table order already satisfies this).

Biome gate:

- The terrain generator guarantees a straight, feature-free 150 m section centred on the boundary, at mean width.
- A gate structure sits on the centreline: two pillars and a lintel (or a ring) 1.2 x width wide, coloured in the **next** biome's accent, flat-shaded, drawn with the terrain's material. Fog and sky lerp over the 200 m before the boundary; vertex colours are baked as the lerp (section 1.1).
- Passing the gate plane: GATE callout, +1000, FOV kick +4 deg, a 120 ms flash in the new sky colour, and the ceiling stripe plane pulses once.
- Visually the gate is the only tall, thin, accent-coloured thing in the world, which is what makes it read as a "level up".

## 7. Audio (not in v1)

A procedural WebAudio layer later needs about 60 lines:

- Engine: two detuned sawtooth oscillators (+-7 cents), base pitch 55-110 Hz mapped to throttle, through a lowpass whose cutoff maps 200-900 Hz to t_v. Gain 0.25.
- Wind: white noise (a looped 2 s buffer) through a bandpass, centre 400-2500 Hz mapped to t_v, Q 0.7, gain 0.6 * t_v^2. This is the sound Superflight relies on.
- Proximity: the same noise through a second bandpass swept up over 120 ms on CLOSE / SO CLOSE.
- Boost: pitch sweep on the engine (x1.5 over 200 ms) and a noise burst.
- Callouts: short sine blip (880 Hz, 60 ms), a fifth higher for SO CLOSE and GATE.
- Ceiling bounce: low sine thud (60 Hz, 150 ms).
- Resume the `AudioContext` on the same click that requests pointer lock.

## 8. Notes for the other tracks

- **Terrain**: expose `density(p)` and `gradient(p)`; guarantee rim >= ceiling + 15 m; honour `minBendRadius(D)`; clear 150 m around gates; bake per-face colours with the rule in 1.1; stream to fog-far + 100 m.
- **Determinism**: score events and near-miss detection run in the fixed-step sim on sampled inputs; shards, shake and streak particles use a separate non-sim RNG so cosmetics never touch the replay state.
- **Stack**: HUD is DOM, sky is one `ShaderMaterial` dome, no EffectComposer in v1, non-indexed chunk geometry with a `color` attribute, `MeshLambertMaterial({ vertexColors: true })`.

## Sources

- Superflight scoring and feel: [Steam store page](https://store.steampowered.com/app/732430/Superflight/), [ROP's Playbook review](https://ropname.substack.com/p/a-gamer-dads-review-superflight), [Pixel Poppers review](https://pixelpoppers.com/review/superflight/), [Antlion review](https://antlionaudio.com/blogs/news/come-fly-with-me-superflight-review), [Steam scoring discussion](https://steamcommunity.com/app/732430/discussions/0/1486613649677081970/), [Steam scoring issues thread](https://steamcommunity.com/app/732430/discussions/0/1698293068431791123/), [Superflight Full Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=1697823700)
- Race the Sun: [Wikipedia](https://en.wikipedia.org/wiki/Race_the_Sun_(video_game)), [TheSixthAxis review](https://www.thesixthaxis.com/2014/10/30/race-the-sun-review-ps4ps3vita/), [TechRaptor review](https://techraptor.net/gaming/review/race-sun-relaxing-review)
- AaAaAA!!! scoring: [Wikipedia](https://en.wikipedia.org/wiki/AaAaAA!!!_%E2%80%93_A_Reckless_Disregard_for_Gravity), [Destructoid review](https://www.destructoid.com/review-aaaaaaaaaa-a-reckless-disregard-for-gravity/)
- Star Fox 64 corridor mode: [Wikipedia](https://en.wikipedia.org/wiki/Star_Fox_64)
- Speed feel techniques: [Elliot Couvignou, Adding the Feeling of Speed](https://elliotdev.gg/adding-the-feeling-of-speed/), [80.lv, lightning-fast characters](https://80.lv/articles/how-to-make-game-characters-feel-lightning-fast)
- Mouse flight model: [brihernandez/MouseFlight](https://github.com/brihernandez/MouseFlight)
- Pointer lock: [MDN requestPointerLock](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestPointerLock)
- three.js: [MeshLambertMaterial docs](https://threejs.org/docs/#api/en/materials/MeshLambertMaterial), [sky + sun shader example](https://threejs.org/examples/webgl_shaders_sky.html), [matching fog to sky (forum)](https://discourse.threejs.org/t/matching-fog-color-with-the-sky-shader/52018)
