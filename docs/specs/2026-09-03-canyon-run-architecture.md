---
status: accepted
date: 2026-09-03
supersedes: none
adrs: [0001, 0002, 0003, 0004, 0005]
---

# Canyon Run — architecture

Consolidates the five research reports in `docs/research/` into one design.
Every number here is a v1 starting value; the constants live in code and
are hashed into replays, so tuning is deliberate and visible.

## 1. Goals and non-goals

Goals: cockpit-view arcade flyer through an endless, seeded, marching-cubes
canyon; roll, pitch, yaw, thrust; a rock ceiling you cannot escape; survival
score weighted by speed; bit-exact replays; several biomes; flat-shaded,
colourful, no textures; extremely fast paced; keyboard and mouse; desktop and
web via the browser; low memory and CPU; headless-runnable so an agent can
drive and validate it.

Non-goals for v1: audio, multiplayer, leaderboards server, native shell,
mobile touch controls, post-processing passes, LOD.

## 2. Stack (ADR 0001)

TypeScript, Vite, pnpm, three.js (pinned), Vitest for unit tests, Playwright
for browser tests and headless runs, ESLint + Prettier with warnings as errors.
Node 24 runs the TypeScript scripts directly. One package, no monorepo.

## 3. Module layout and dependency rule

```
src/
  sim/        pure simulation core — no DOM, no three.js, no transcendentals
  terrain/    pure field + noise + marching cubes + mesher — same rules as sim
  render/     three.js adapter: scene, chunk meshes, sky, camera, effects
  app/        browser wiring: loop, input, HUD, storage, worker client, test mode
  cli/        Node entry points: replay validate / run
tools/headless/  Playwright runner, frame stats, gates, contact sheets
tests/e2e/       Playwright specs (cross-engine replay, render gates)
scripts/         new-work-item.ts, issues.ts, git-hooks/
```

Dependency direction: `app → render → (sim, terrain)`, `app → sim`,
`cli → sim, terrain`, `sim → terrain` (field query only). `sim` and `terrain`
import nothing from `render` or `app` and no platform globals. Unit tests are
co-located as `*.test.ts`.

## 4. World conventions

- Units: 1 u = 1 m. Y up. **Flight axis is +Z**; distance flown is `z`.
- Body frame at identity orientation: forward `+Z`, up `+Y`, right `-X`.
  The render adapter applies a 180° yaw so the three.js camera (which looks
  down `-Z`) matches.
- Command space: `+roll` = roll right, `+pitch` = nose up, `+yaw` = yaw right.
  Body angular velocity is `ω = (-pitchRate, -yawRate, +rollRate)`; unit tests
  pin these signs (pitch up raises `forward.y`).
- Chunk grid: chunk `(cx, cy, cz)` has origin `(cx, cy, cz) · 64`; sample
  `(i, j, k) ∈ [0, 32]³` sits at `origin + (i, j, k) · 2`. A slab is all chunks
  with the same `cz`.
- Field sign: `d > 0` rock, `d < 0` air.

## 5. Simulation core (ADR 0002)

### 5.1 State

```ts
interface SimState {
  tick: number; alive: 0 | 1;
  x: number; y: number; z: number;
  qx: number; qy: number; qz: number; qw: number;   // body → world
  speed: number; throttle: number;                  // u/s, [0,1]
  rollRate: number; pitchRate: number; yawRate: number; // rad/s, filtered
  score: number;                                    // integer milli-points
  proximity: number;                                // [0,1], 1 = touching, from the field
  seed: number; rng: Uint32Array;                   // u32 seed, sfc32 state (4 × u32)
}
```

### 5.2 Input per tick

`{ keys: u16, dx: i16, dy: i16 }`. Key bits: `1 ROLL_L, 2 ROLL_R, 4 PITCH_UP,
8 PITCH_DOWN, 16 YAW_L, 32 YAW_R, 64 THR_UP, 128 THR_DOWN`. Bits 8–15 are
reserved and must be zero.

### 5.3 Tick (60 Hz, `DT = 1/60` literal)

```
commands:  cmdRoll  = clamp(kRoll + dx·MOUSE_ROLL_GAIN, -1, 1)
           cmdPitch = clamp(kPitch - dy·MOUSE_PITCH_GAIN, -1, 1)
           if cmdRoll == 0: cmdRoll = clamp(right.y · AUTO_LEVEL, -1, 1)
           cmdYaw   = clamp(kYaw - right.y · BANK_YAW_GAIN, -1, 1)
           ceiling soft zone: cmdPitch -= CEIL_PUSH · depthIntoZone
rates:     r += (cmd·MAX_RATE + gust - r) · RATE_LERP      (gust from sfc32 · TURBULENCE)
attitude:  q = normalize(q + 0.5·DT · q ⊗ (ω, 0))
speed:     throttle = clamp(throttle + kThr·THROTTLE_PER_TICK, 0, 1)
           target = MIN_SPEED + throttle·(MAX_SPEED - MIN_SPEED)
           speed += (target - speed)·SPEED_LERP
           speed = clamp(speed - DIVE_GAIN·fwd.y·DT, MIN_SPEED·0.6, MAX_SPEED + 30)
position:  p += fwd · speed · DT ; y = min(y, ceilY(z) - CEIL_MARGIN)
collision: for each hull probe (nose, tail, wing tips, top, bottom) at 2 sub-steps
           along the tick's travel: alive = 0 if d(probe) > -HULL_TOLERANCE
proximity: clamp(-d(centre) / 25, 0, 1)
score:     sf = clamp((speed - MIN_SPEED)/(MAX_SPEED - MIN_SPEED), 0, 1)
           score += floor(SCORE_PER_TICK · (SCORE_FLOOR + (1 - SCORE_FLOOR)·sf·sf) · (1 + PROX_BONUS·proximity))
```

v1 constants: `MIN_SPEED 50`, `MAX_SPEED 170`, `THROTTLE_PER_TICK 1/90`,
`SPEED_LERP 0.03`, `DIVE_GAIN 20`, `ROLL_RATE 3.5`, `PITCH_RATE 1.75`,
`YAW_RATE 0.7`, `RATE_LERP 0.2`, `MOUSE_*_GAIN 0.02`, `BANK_YAW_GAIN 0.6`,
`AUTO_LEVEL 0.35`, `CEIL_MARGIN 16` (was 8: the warped roof dips up to 14 u below `ceilY`, see docs/domain/terrain-field.md), `CEIL_SOFT 20`, `CEIL_PUSH 2`,
`TURBULENCE 0`, `HULL_TOLERANCE 0.4`, `SCORE_PER_TICK 1000`,
`SCORE_FLOOR 0.2`, `PROX_BONUS 1.0`. All per-tick; none derived with `exp`.

### 5.4 Replay format v1 (JSON)

```json
{ "format": "canyon-replay/1", "simVersion": "0.1.0", "constantsHash": "xxxxxxxx",
  "tickRate": 60, "seed": 123, "ticks": 7200, "finalScore": 123456,
  "finalChecksum": "xxxxxxxx",
  "runs": [[count, keys, dx, dy], ...],
  "checkpoints": [[60, "xxxxxxxx"], ...],
  "meta": {} }
```

Checksum = FNV-1a 32 over little-endian f64 bits of
`x y z qx qy qz qw speed throttle rollRate pitchRate yawRate score` followed by
u32 `tick alive rng[0..3]`. The validator re-simulates and reports
`ok | score-mismatch | checkpoint-mismatch(tick) | version-mismatch | malformed`.

## 6. Terrain (ADR 0004)

### 6.1 Contracts

```ts
// src/terrain/field.ts
density(seed: number, x: number, y: number, z: number): number   // full field, d>0 rock
spine(seed: number, z: number): { cx: number; floorY: number; ceilY: number; coreY: number; hw: number }
biomeAt(seed: number, z: number): { a: BiomeId; b: BiomeId; t: number }   // blend
// src/terrain/chunk.ts
buildChunk(seed, cx, cy, cz, scratch): ChunkMesh | null   // null when empty
interface ChunkMesh { cx, cy, cz, tris: number, pos: Float32Array /* tris*9, chunk-local */, rgba: Uint8Array /* tris*12 */ }
```

The sim uses `density` and `spine` only. Chunk meshes are pure functions of
`(seed, cx, cy, cz)`.

### 6.2 Canyon field (hub biome, v1 values)

Spine: `cx(z) = 80·fbm1(z/800, 2 oct) + 12·vnoise1(z/260)`,
`floorY(z) = 30·fbm1(z/520, 2 oct)`, `H = 110`, `ceilY = floorY + H`,
`coreY = floorY + 0.45·H`, `hw(z) = 40·(1 + 0.35·vnoise1(z/230))`.
Base: `profile(h) = 1 + 0.3·S(0,1,h) − 0.6·S(0.7,1,h)`,
`sdWall = |x − cx| − hw·profile`, `sdFloor = floorY − y`, `sdCeil = y − ceilY`,
`base = max(sdWall, sdFloor, sdCeil)`. Detail: domain warp 10 u at λ 45,
wall ridges 7 u at λ 28 (y stretched ×0.35), floor fBm 5 u, ceiling fBm 4 u,
fine detail 1.5 u at λ 7, smooth-max radius 8. Features: pillars (cells 56 u,
p 0.35, r 5), boulders (cells 20 u, p 0.25, r 2–6), arches (z cells 256 u,
p 0.3). Core tube `Rcore = 12`. Shell skip bound `B ≈ 31`.

### 6.3 Meshing and colour

32³ cells, 2 u, Bourke tables, air-bit convention, canonical +axis edge
interpolation via an edge cache, non-indexed output, per-face colour:
material from `n.y` (floor > 0.6, ceiling < −0.35, else wall), height band
`frac(h·nBands + 0.4·noise3(p/50))`, biome ramp lookup, ±10 % hashed jitter.

### 6.4 Worker protocol

```
main → worker : { type: 'seed', seed }
main → worker : { type: 'slab', s }
worker → main : { type: 'chunk', cx, cy, cz, tris, pos, rgba }   // transfer [pos.buffer, rgba.buffer]
worker → main : { type: 'slabDone', s, chunkCount, ms }
```

Resident slabs `s−1 … s+10`; evict below `s−1`; ≤ 4 uploads per frame.

### 6.5 Biomes

Segments: even = canyon (1200 u), odd = special (2400 u) chosen by
`hash1(segmentIndex, seed)`. Blend 320 u. Specials in v1 order of delivery:
cave, crystal spires, lava rift, hoodoo desert, floating archipelago.
Palettes per biome for wall ramp, floor, ceiling, fog/sky, key light.

## 7. Rendering

- One `BufferGeometry` per chunk (position f32×3, color u8×4 normalised),
  `MeshLambertMaterial({ vertexColors: true, flatShading: true })`, chunk
  world offset in the mesh position. Frustum culling by three.js per chunk.
- Sky: inverted sphere with a small `ShaderMaterial` (horizon → zenith
  gradient, sun disc, Bayer dither), follows the camera. Fog `FogExp2`,
  colour = biome horizon; `scene.background` the same.
- Lights: one directional (35° elevation, 60° off-axis), one hemisphere.
  No shadows.
- Camera: rigid to the interpolated sim pose (`lerp` position, `nlerp`
  quaternion, then the 180° yaw), `fov = 66 + 18·t_v`, near 0.5, far 800.
  Render-side effects (lean spring, shake, streaks, vignette) may use any
  `Math.*`.
- HUD: DOM overlay; transforms only; text at 15 Hz.

## 8. App loop, input, test mode

- Accumulator loop, ≤ 5 ticks per frame, `prev/cur` snapshots, alpha to the renderer.
- `InputSampler`: latched key bits, accumulated integer mouse deltas per tick.
  Pointer lock on click. Keys: W/S pitch, A/D roll, Q/E yaw, Shift/Ctrl thrust,
  R restart same seed, N new seed, Esc pause.
- Recorder writes the replay of every run; a replay can be played back from
  `?replay=` or an injected `window.__replay`.
- Test mode (`?test=1`): no rAF autostart, no pointer lock,
  `preserveDrawingBuffer: true`, `window.__game = { step(n), state(), setInput(i),
  frameHash(), readPixel(x,y), dataURL(), chunkStats() }`, `window.__info.renderer`.

## 9. Headless tooling (ADR 0003)

`pnpm headless -- --replay r.json --frames 300 --every 30 --out runs/x`
serves `dist/`, drives the page, writes `frames.jsonl`, PNGs, a contact sheet,
and `stats.json` with the semantic checks. `pnpm headless:gate` fails on any
violated check. Goldens live in `tests/golden/<renderer-key>/`.

## 10. Testing strategy

- Unit (Vitest): noise known-answer vectors and cross-language checksum,
  hash/PRNG vectors, marching-cubes table validation and closed random-grid
  mesh, quaternion signs, tick invariants, replay codec round trip, scoring.
- Property (fast-check): ceiling invariant, unit quaternion, speed bounds,
  monotone integer score, step determinism on cloned state.
- Golden replays under `tests/replays/` with checkpoints; regenerated only by
  `pnpm sim:regold`, which bumps `simVersion`.
- Cross-engine: Playwright replays a golden in Chromium and compares with Node.
- Render gates: semantic pixel checks per ADR 0003 on a fixed replay.
- Lint gate: banned `Math.*` in `sim/` and `terrain/`; a test replays a golden
  with `Math.sin` stubbed to throw.

## 11. Verification gates per story

`pnpm check` = typecheck + lint (max warnings 0) + unit tests. A story is done
when `pnpm check` and `pnpm build` pass, the headless run for user-visible
changes was executed before and after with contact sheets read, and docs
shipped with the change. The pre-push hook runs `pnpm check` and validates
docs frontmatter.
