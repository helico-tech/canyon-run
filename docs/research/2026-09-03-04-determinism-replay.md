---
title: Deterministic simulation and replay for Canyon Run
date: 2026-09-03
status: proposal
author: research-determinism (agent)
probes: ../probes/determinism/
---

# Deterministic simulation and replay

Design for a fixed-timestep, bit-reproducible simulation core that supports (a) golden-replay
regression tests, (b) server/CLI score validation by re-simulation, and (c) headless AI agents.
Target: TypeScript sim core shared by browser and Node. Rust/wasm assessed as an alternative.

## 1. Recommendations at a glance

| Topic | Recommendation |
|---|---|
| Tick rate | **60 Hz**, `DT = 1/60` as a literal constant. Accumulator loop, max 5 catch-up ticks per frame. |
| Numeric strategy | **binary64 (plain JS `number`) with a transcendental-free sim core.** Only `+ - * /`, `Math.sqrt`, `Math.floor/round/abs/min/max`, and 32-bit integer ops are allowed inside `sim/`. Orientation is integrated as a quaternion without any `sin/cos`. Where a transcendental is genuinely unavoidable, use our own polynomial module (`dmath.ts`), never `Math.sin` & co. |
| Fixed-point | Rejected: more code, worse ergonomics, no benefit once the core is transcendental-free. |
| Rust/wasm | Not for v1. wasm's core float ops are spec-deterministic and Rust's `libm` crate makes transcendentals deterministic too, so it is a sound escape hatch if TS ever drifts or gets slow. Keep the TS sim pure and small so it stays portable. |
| Orientation | Unit quaternion, body-rate first-order update + renormalise each tick. |
| Input per tick | `{ keys: u16 bitflags, dx: i16, dy: i16 }`; keys latched, mouse deltas accumulated since the previous tick and rounded to integers. |
| Replay v1 | **JSON** container with RLE runs `[count, keys, dx, dy]`, header (format, simVersion, constantsHash, seed, tickRate), checkpoints every 60 ticks, final score + checksum. Gzip at transport. Binary layout specified for later. |
| Checksums | FNV-1a 32 over the little-endian binary64 bits of the state vector plus PRNG state and tick, every 60 ticks. Diagnostic only; the authoritative score is the re-simulation's. |
| Scoring | Integer points per tick inside the sim: `floor(1000 * (0.25 + 0.75 * speedFactor))`. |
| PRNG | **sfc32** seeded from **splitmix32**, state stored in the sim state and hashed. Terrain uses stateless integer hashing of `(seed, ix, iz)`. |
| Tests | Unit (pure core), golden replays committed with checkpoints, cross-engine job (Node + Chromium + Firefox + WebKit via Playwright), property tests with fast-check, lint rule banning `Math.sin`-class calls and clocks in `sim/`. |

## 2. Probe evidence (Node 24.14, Chromium 151, Firefox 153, this machine)

All probes live in `probes/determinism/` (run `node 0N-*.mjs`; `06` needs the Playwright browsers).

| Fact | Evidence |
|---|---|
| No FMA contraction in V8 or SpiderMonkey | `01`: `(1+2^-52)*(1-2^-53) + (-1) === 0` in Node, Chromium, Firefox (`06`). |
| `Math.fround`, `Math.sqrt`, JSON round-trip, `Math.imul`, `-0` bits all behave per spec | `01`. |
| Own polynomial `dsin/dcos` is within 1 ulp of V8's `Math.sin` but bit-identical only 84% of the time | `02`: max abs err 1.1e-16, 841,617 / 1,000,000 identical. Any two correct implementations differ in the last bit; that is why engine `Math.*` cannot be relied on. |
| **`Math.cos(0.1)` differs between Node 24 (V8) and Chromium 151 (V8) and Firefox 153** | `06`: `3fefd712f9a817c0` vs `...c1`. Chromium/Firefox return the correctly rounded value; Node 24 is 1 ulp off. Same engine family, different version, different bits. |
| **`Math.hypot(0.1, 0.2)` differs between V8 and SpiderMonkey** | `06`: `3fcc9f25c5bfedda` (V8, correctly rounded) vs `...d9` (Firefox). |
| **Transcendental-free sim replays bit-identically across Node 24, Chromium 151, Firefox 153** | `06`: 120 checkpoints and final checksum `69d38057`, score 5,690,479 identical in all three. |
| Replay encode/decode (JSON and binary) reproduces every checkpoint | `05`. |
| A one-count mouse mutation at tick 3604 is detected at checkpoint tick 3660 and changes the score | `05`. |
| Headless throughput of the probe model (incl. terrain sampling) | `05`: ~6.9 M ticks/s in Node, i.e. ~115,000 s of gameplay per wall-clock second. |
| 2-minute replay with per-tick mouse jitter | `05`: JSON 86.9 KB raw / 13.3 KB gzip; binary 57.2 KB / 12.7 KB gzip. RLE barely helps with mouse jitter (7028 runs for 7200 ticks); gzip does. |
| Invariants under random input streams (ceiling, unit quaternion, speed bounds, integer monotone score, no NaN) and step-determinism with mid-run cloning | `07` (fast-check, 500 runs). |
| WebKit (JSC) | Not verified: Playwright's WebKit could not launch here (missing system libraries). Must be covered by the CI cross-engine job. |

## 3. Fixed-timestep architecture

### 3.1 Tick rate: 60 Hz

* One tick per frame on the dominant 60 Hz displays gives the least interpolation smear and the smallest replay.
* 120 Hz doubles CPU, replay size, and checksum count for no gameplay benefit in an arcade flyer; the flight model is a low-pass filter over inputs, so 16.7 ms of input latency is invisible.
* 100 Hz has no integer relation to 60/120/144 Hz displays and makes "ticks per frame" jitter between 1 and 2 constantly.
* Store `DT = 1 / 60` once as a literal. Never derive it from the clock. It is `0x3f91111111111111`; the sim is defined in tick space and time only matters for display.

### 3.2 Loop

```ts
// app/loop.ts  (browser)  — the only place that touches the clock
const DT_MS = 1000 / 60, MAX_TICKS_PER_FRAME = 5;
let acc = 0, last = performance.now();
let prev = cloneState(sim.state), cur = sim.state;   // two snapshots for interpolation

function frame(now: number) {
  acc += Math.min(now - last, 250);   // clamp long pauses (tab switch) so we never spiral
  last = now;
  let ticks = 0;
  while (acc >= DT_MS && ticks < MAX_TICKS_PER_FRAME) {
    const input = inputSampler.take();      // latched keys + accumulated int mouse delta, then reset
    recorder.push(input);
    copyState(prev, cur);
    sim.step(input);                        // pure, uses only state + input + constants
    acc -= DT_MS; ticks++;
  }
  if (ticks === MAX_TICKS_PER_FRAME) acc = 0;   // drop backlog; the sim does not care about wall time
  renderer.draw(prev, cur, acc / DT_MS);        // alpha in [0,1): interpolate pos (lerp) and orientation (nlerp)
  requestAnimationFrame(frame);
}
```

Key properties:

* The clock decides **how many** ticks run, never **what** a tick does. A replay is a list of inputs, not of timestamps.
* Dropping backlog under load changes when ticks happen in wall time but not their content. The recording stays valid.
* `prev`/`cur` are read-only for the renderer. Interpolation happens in render code with render maths (any `Math.*` allowed there).

### 3.3 Input sampling

```ts
interface InputFrame { keys: number /* u16 */; dx: number /* i16 */; dy: number /* i16 */ }

class InputSampler {
  private keys = 0; private accX = 0; private accY = 0;
  onKey(bit: number, down: boolean) { this.keys = down ? this.keys | bit : this.keys & ~bit; }
  onMouseMove(e: MouseEvent) { this.accX += e.movementX; this.accY += e.movementY; } // pointer lock
  take(): InputFrame {
    const dx = clampI16(Math.round(this.accX)), dy = clampI16(Math.round(this.accY));
    this.accX = 0; this.accY = 0;
    return { keys: this.keys, dx, dy };
  }
}
```

* Keys are **latched**: a key pressed and released between two ticks still counts for the next tick (track a "pressed since last take" mask OR the current state; simplest is `keysSeen |= keys` on keydown, cleared on take).
* Mouse deltas are integers. `movementX` can be fractional on some HiDPI setups (Chrome on macOS), so round explicitly. Clamp to int16.
* When several ticks run in one frame, the first tick gets the whole delta and the rest get 0. This is deterministic and recorded as-is; splitting would need a fixed integer rule and buys nothing.
* Sensitivity scaling (mouse gain) lives in the **sim constants**, not in the sampler, so a replay is independent of the player's settings. If per-player sensitivity is wanted, store it in the replay header and treat it as a constant of that replay.

### 3.4 Guaranteeing the renderer cannot influence the sim

1. **Package boundary.** `src/sim/**` has its own `tsconfig` with `"lib": ["ES2022"]` and no `DOM`, so `window`, `document`, `performance`, `requestAnimationFrame` are type errors.
2. **Pure signature.** `step(state, input, C)` mutates `state` in place (perf) but reads nothing else. No module-level mutable state in `sim/`.
3. **Lint gate.** ESLint `no-restricted-syntax`/`no-restricted-properties` in `sim/`: forbid `Math.sin cos tan asin acos atan atan2 exp expm1 log log1p log2 log10 pow hypot cbrt sinh cosh tanh random`, `Date`, `performance`, `**`, `parseFloat`, `toFixed`. A CI grep does the same for belt and braces.
4. **Dev-time freeze.** In development builds the renderer receives a `Readonly<SimState>`; snapshots handed to the renderer are `Object.freeze`d.
5. **Sim runs in Node in tests** with no DOM shim. If it needs one, it is broken.

## 4. Floating-point determinism

### 4.1 What is deterministic across engines

Guaranteed by ECMAScript (IEEE 754 binary64, round-to-nearest-even, no contraction, no extended precision on any current target):

* `+ - * /`, `%`, comparisons, `Math.sqrt` (correctly rounded by IEEE), `Math.fround`, `Math.abs/floor/ceil/round/trunc/sign/min/max`.
* Integer ops on int32/uint32: `| & ^ ~ << >> >>>`, `Math.imul`, `Math.clz32`.
* `Number#toString`/JSON serialisation (shortest round-trip) and parsing.
* Typed-array reads/writes, `DataView` with explicit endianness.
* Evaluation order of an expression as written (no reassociation). `(a+b)+c` and `a+(b+c)` are different expressions and both are reproducible.

Verified across JIT tiers implicitly: the cross-engine replay ran through interpreter, baseline and optimising tiers in all three engines and stayed identical.

### 4.2 What is not

* `Math.sin cos tan atan2 exp log pow hypot cbrt …`: the spec only says "implementation-approximated". V8 and SpiderMonkey both ship fdlibm-derived code but with different patches and versions; JSC uses the platform libm. The probes show a 1-ulp `cos` difference **between two V8 versions** and a `hypot` difference between V8 and SpiderMonkey. Last-bit differences compound through a chaotic flight model into visible divergence within seconds.
* `**` operator: spec-equivalent to `Math.pow`, historically not bit-equal in V8. Ban both in `sim/`.
* Anything derived from those at load time. **Trap:** computing a smoothing coefficient as `1 - Math.exp(-dt / tau)` in a constants file makes the constants engine-dependent. Store per-tick coefficients as literals (or compute offline and paste the literal).
* `Math.random`, `Date.now`, `performance.now`, `crypto.getRandomValues`.
* Iteration order of `Set`/`Map` is insertion order (deterministic) but object key order after `delete` plus numeric-like keys is a foot-gun; the sim uses arrays and typed arrays only.
* NaN payloads: hashing `NaN` bits is engine-dependent (probe `04` showed two different NaN patterns in one engine). A NaN in state is a bug; assert on it in tests.
* `Array.prototype.sort` with an inconsistent comparator. Stable since ES2019; keep comparators total.

### 4.3 Strategy options

| Option | Determinism | Cost | Verdict |
|---|---|---|---|
| (iii) Engine-level only ("same engine = same result") | Not even true across V8 versions (probe). Server validation on Node vs browser submissions would reject honest scores. | None | Reject. |
| (ii) Fixed-point integers for the whole sim | Absolute, also across languages. | Every quaternion op needs scaled multiplies and manual overflow care; 32-bit fixed point lacks range for a 1 km canyon with mm precision, so you end up in BigInt or 64-bit emulation; slow and unpleasant in JS. | Reject for this game. |
| (i) binary64 with own transcendental polynomials | Absolute across engines for the polynomial part; still requires discipline for everything else. | A small `dmath.ts`; ~1 ulp accuracy is easy (probe). | Good. |
| **(i′) binary64, sim designed to need no transcendentals; `dmath.ts` as fallback** | Absolute (demonstrated in probe `06`). | Smallest surface: quaternion integration, dot/cross products, `sqrt`, integer hashing. | **Recommended.** |

Why (i′) fits this game: an arcade flight model is a handful of first-order filters plus a quaternion update; none of that needs trigonometry. Bank angle for turn coupling is the `y` component of the body right-vector, which comes straight out of the quaternion. Auto-level torque is proportional to the same component. Terrain sampling uses integer hashing plus smoothstep polynomials. Scoring is a multiply and a floor. `dmath.sin/cos/atan2` remain available for the rare case (e.g. an oscillating obstacle, HUD-only values), but should be the exception and are reviewed.

Use `number` (binary64), not `Math.fround` everywhere: binary32 gives no extra determinism in JS, halves precision, and costs a call per op. The only reason to use `fround` would be matching an `f32` implementation elsewhere; there is none.

### 4.4 wasm and Rust

* **wasm core float semantics are deterministic by spec**: `f32/f64` `add sub mul div sqrt min max nearest floor ceil trunc abs neg copysign` are IEEE 754 with round-to-nearest, no fusing, no fast-math. The only permitted nondeterminism is NaN bit patterns (never observable in a NaN-free sim). Core SIMD is also deterministic; **relaxed-simd** (`relaxed_madd`, `relaxed_min` …) is explicitly not; never enable it for the sim.
* wasm has no `sin`/`exp`. Rust's `f64::sin` on `wasm32-unknown-unknown` compiles to a pure-wasm `libm` port (musl-derived) inside the module, so transcendentals are deterministic on **every** wasm runtime automatically. On native targets `f64::sin` calls the platform libm instead, so native and wasm builds can differ by a ulp. To make native tools (CLI validator) bit-equal to the wasm build, call the `libm` crate explicitly on both targets and never `std`'s float methods for transcendentals. Do not use `mul_add` (FMA on native, software on wasm; both deterministic but not equal to `a*b+c`).
* Attractive properties: one compiled artefact runs in browser, Node, Deno, and a native CLI with identical bits; `no_std` core is trivially DOM-free; 2 to 5× faster than JS for heavy terrain collision; f64 determinism does not depend on developer discipline about `Math.*`.
* Costs: two toolchains, `wasm-bindgen`/`wasm-pack` glue, state marshalling across the boundary (renderer must read positions from wasm memory each frame), harder debugging in the browser, slower iteration on the flight feel.
* **Decision:** stay in TypeScript for v1; the probe shows TS meets the bar. Keep `sim/` free of platform imports and under ~1500 lines so a Rust port stays a bounded task. Revisit if the cross-engine CI job ever goes red for a reason that is not a bug, or if terrain collision needs more than ~30% of a frame.

## 5. Flight model

### 5.1 State and conventions

```ts
interface SimState {
  tick: number; alive: 0 | 1;
  x: number; y: number; z: number;             // world position, metres. Y up, forward at start = -Z
  qx: number; qy: number; qz: number; qw: number;   // unit quaternion, body -> world
  speed: number; throttle: number;             // m/s along body forward; throttle in [0,1]
  rollRate: number; pitchRate: number; yawRate: number;   // rad/s, smoothed (explicit state)
  score: number;                               // integer milli-points
  seed: number; rng: Uint32Array;              // u32 seed, sfc32 state (4 × u32)
}
```

Body frame: `X` = right, `Y` = up, forward = `-Z`. Sign conventions in **command space** (what the player means): `+roll` = roll right, `+pitch` = nose up, `+yaw` = yaw right. Mapping to body angular velocity: `ω = (+pitchRate, -yawRate, -rollRate)` about `(X, Y, Z)`. Basis vectors are obtained by rotating unit axes with the quaternion (multiplies and adds only):

```ts
function rotate(q, v) { const t = 2 * cross(q.xyz, v); return v + q.w * t + cross(q.xyz, t); }
right = rotate(q, (1,0,0)); up = rotate(q, (0,1,0)); fwd = rotate(q, (0,0,-1));
```

### 5.2 Constants (single tunable object, hashed into every replay)

```ts
export const C = Object.freeze({
  TICK_RATE: 60, DT: 1 / 60,
  // speed
  MIN_SPEED: 30, MAX_SPEED: 120, OVERSPEED: 150,   // m/s; OVERSPEED only reachable by diving
  THROTTLE_PER_TICK: 1 / 60,                      // full throttle travel in 1 s
  SPEED_LERP: 0.03,                               // per-tick first-order response toward throttle target
  DIVE_GAIN: 25,                                  // m/s² gained per unit of downward forward.y (gravity-lite)
  // rotation
  ROLL_RATE: 3.0, PITCH_RATE: 1.6, YAW_RATE: 0.9, // rad/s at full command
  RATE_LERP: 0.15,                                // per-tick smoothing of angular rates
  MOUSE_ROLL_GAIN: 0.02, MOUSE_PITCH_GAIN: 0.02,  // command units per mouse count (1 count = 2% of full deflection)
  BANK_YAW_GAIN: 0.6,                             // yaw command induced per unit of bank (right.y)
  AUTO_LEVEL: 0.35,                               // roll command toward level when the player gives no roll input
  // envelope
  CEILING: 300, CEILING_SOFT: 40, CEILING_PUSH: 3.0,
  TURBULENCE: 0.02,                               // rad/s of PRNG pitch noise (0 disables, keeps PRNG in the loop anyway)
  HULL_RADIUS: 2,
  // scoring
  SCORE_PER_TICK: 1000, SCORE_SLOW_FLOOR: 0.25,
  START_Y: 150,
});
```

All time-dependent coefficients are expressed **per tick** so that no `exp` is evaluated at runtime. Changing any value changes `constantsHash` and therefore invalidates old replays by design.

### 5.3 Tick equations (see `probes/determinism/sim.mjs` for the runnable version)

```
inputs → commands
  kRoll, kPitch, kYaw, kThr ∈ {-1,0,1} from key bits
  cmdRoll  = clamp(kRoll  + dx * MOUSE_ROLL_GAIN, -1, 1)
  cmdPitch = clamp(kPitch - dy * MOUSE_PITCH_GAIN, -1, 1)          // mouse forward = nose down
  cmdYaw   = kYaw
  if cmdRoll == 0: cmdRoll = clamp(right.y * AUTO_LEVEL, -1, 1)    // wing low → roll back toward level
  cmdYaw   = clamp(cmdYaw - right.y * BANK_YAW_GAIN, -1, 1)        // banked right (right.y<0) → yaw right
  if y > CEILING - CEILING_SOFT:
      cmdPitch = clamp(cmdPitch - CEILING_PUSH * (y - (CEILING - CEILING_SOFT)) / CEILING_SOFT, -1, 1)

rates (first-order filters; explicit state)
  gust      = (rngUnit() - 0.5) * TURBULENCE
  rollRate  += (cmdRoll  * ROLL_RATE          - rollRate ) * RATE_LERP
  pitchRate += (cmdPitch * PITCH_RATE + gust  - pitchRate) * RATE_LERP
  yawRate   += (cmdYaw   * YAW_RATE           - yawRate  ) * RATE_LERP

orientation (body-frame rates, first order, renormalise)
  h = 0.5 * DT * (pitchRate, -yawRate, -rollRate)
  q ← normalize(q + q ⊗ (h, 0))            // q ⊗ p expanded to 16 multiplies; normalize = 1/sqrt(dot)

speed
  throttle = clamp(throttle + kThr * THROTTLE_PER_TICK, 0, 1)
  target   = MIN_SPEED + throttle * (MAX_SPEED - MIN_SPEED)
  speed   += (target - speed) * SPEED_LERP
  speed    = clamp(speed - DIVE_GAIN * fwd.y * DT, MIN_SPEED * 0.5, OVERSPEED)   // climbing bleeds, diving gains

position and ceiling
  pos += fwd' * speed * DT                   // fwd' from the updated quaternion
  y = min(y, CEILING)                        // hard clamp guarantees the invariant

collision (terrain module, pure)
  alive = 0 if y < floorHeight(seed, x, z) + HULL_RADIUS or |x| > halfWidth(seed, z) - HULL_RADIUS

score
  sf     = clamp((speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED), 0, 1)
  score += floor(SCORE_PER_TICK * (SCORE_SLOW_FLOOR + (1 - SCORE_SLOW_FLOOR) * sf))
  tick  += 1
```

Notes:

* First-order quaternion integration with renormalisation is standard for games; at 60 Hz and rates ≤ 3 rad/s the drift is below 1e-15 per tick (probe `05`: max norm error 3.3e-16). If a "cleaner" integrator is ever wanted, use the second-order Taylor form `q ⊗ (1 - |h|²/2, h·(1 - |h|²/6))`, still transcendental-free. Do not use the exact exponential map (needs `sin`/`cos`).
* Gravity-lite is a speed coupling, not a force: no vertical velocity state to tune, and the plane never sinks while level.
* Banking turns come from `right.y`, which is `sin(roll)` when level, with no trigonometry.
* Ceiling is a soft push (pitch command) plus a hard clamp so the property "never above ceiling" is trivially true.
* Terrain must expose pure `floorHeight(seed, x, z)` and wall queries built from integer hashing and polynomial interpolation. This is a shared contract with the terrain research thread: the renderer builds meshes from the same function, and the sim must never read heights from GPU or mesh data.

### 5.4 Interpolation for rendering

`pos = lerp(prev.pos, cur.pos, alpha)`; `q = nlerp(prev.q, cur.q, alpha)` (normalised lerp is adequate for the tiny per-tick rotation). Camera lag, FOV kick with speed, and roll-induced camera tilt are render-side effects computed from the interpolated state and may use any `Math.*`.

## 6. Input model and replay format

### 6.1 Key bits

| Bit | Key | Bit | Key |
|---|---|---|---|
| 1 | ROLL_L | 16 | YAW_L |
| 2 | ROLL_R | 32 | YAW_R |
| 4 | PITCH_UP | 64 | THR_UP |
| 8 | PITCH_DOWN | 128 | THR_DOWN |

Bits 8..15 reserved (boost, brake, pause-request …). Unused bits must be zero so that keyboard remapping never touches the replay.

### 6.2 JSON container (v1, recommended)

```json
{
  "format": "canyon-replay/1",
  "simVersion": "0.3.0",
  "constantsHash": "4f012ca7",
  "tickRate": 60,
  "seed": 20260903,
  "ticks": 7200,
  "finalScore": 5690479,
  "finalChecksum": "69d38057",
  "runs": [[1, 16, -2, 22], [1, 16, 2, 21], [1, 16, 3, 21], ...],
  "checkpoints": [[60, "8d48bfc7"], [120, "4d1d6b6e"], [180, "e43a925b"], ..., [7200, "69d38057"]],
  "meta": { "recordedAt": "2026-09-03T10:58:00Z", "client": "web 0.3.0", "player": "..." }
}
```

* `runs`: RLE over identical `(keys, dx, dy)` tuples, count ≤ 65535. `ticks` bounds the decode (a trailing run may be shorter).
* `checkpoints`: `[tick, fnv1a32 hex]` every 60 ticks plus the final tick.
* `meta` is informational and excluded from validation.
* Size: 2 minutes of continuous mouse input is ~87 KB raw and ~13 KB gzipped (probe). Leaderboard submissions are gzipped in transit; committed golden replays stay plain JSON so diffs are reviewable.

Why JSON for v1: human-readable golden files, diffable in code review, trivially inspectable in the browser devtools, no endianness or alignment concerns, and gzip closes 95% of the size gap to binary (13.3 KB vs 12.7 KB in the probe).

### 6.3 Binary layout (specified now, adopt only if size or parse time matters)

```
offset  size  field
0       4     magic "CRP1"
4       u16   format version (1)
6       u16   tick rate (60)
8       u32   seed
12      u32   constantsHash
16      u32   ticks
20      u32   finalScore
24      u32   finalChecksum
28      u32   runCount
32      u32   checkpointCount
36      8×runCount        run: u16 count, u16 keys, i16 dx, i16 dy
...     8×checkpointCount checkpoint: u32 tick, u32 hash
```

Little-endian throughout; `simVersion` string goes in a trailing length-prefixed UTF-8 field if needed. A codec for both forms exists in `probes/determinism/replay.mjs` and round-trips bit-identically.

### 6.4 Checksums

```ts
function checksum(s: SimState): number {   // u32
  return fnv1a32(le_bytes_f64([s.x, s.y, s.z, s.qx, s.qy, s.qz, s.qw, s.speed, s.throttle,
                               s.rollRate, s.pitchRate, s.yawRate, s.score])
               ++ le_bytes_u32([s.tick, s.alive, s.rng[0], s.rng[1], s.rng[2], s.rng[3]]));
}
```

* Hash the **bits** (`DataView.setFloat64(o, v, true)`), never the decimal string; use explicit little-endian so the hash is the same on any host.
* Every 60 ticks (1 s) and at the end. A divergence is localised to a 60-tick window; a validator can then re-run that window with per-tick hashing to find the exact tick.
* FNV-1a 32 is enough because the checksums are diagnostic. The **score is never trusted from the file**: the validator re-simulates the inputs and compares its own final score and checksum with the claimed ones. A forged replay therefore needs real inputs that really achieve the score, which is by definition a legitimate run (bots included, see §10).
* Include the PRNG state so a divergence in random draws is caught at the same checkpoint as everything else.
* If collisions ever matter, run a second FNV pass with a different offset basis and concatenate to 64 bits; not needed for v1.

### 6.5 Versioning and validation policy

* `simVersion` is a semver string bumped on any behavioural change in `sim/`; `constantsHash` is the FNV-1a of the canonical JSON of the sorted constants entries (probe `replay.mjs#hashConstants`). Both are checked before replaying; mismatches are rejected with a message, never "best-effort replayed".
* Leaderboards are keyed by `simVersion`. Old versions are not kept alive in code (YAGNI); their boards are frozen.
* The validator (CLI, Node) reports: `ok`, `score-mismatch(claimed, computed)`, `checkpoint-mismatch(firstTick)`, `version-mismatch`, `malformed`.

## 7. Scoring

* Computed **inside** `step`, in integer milli-points, so replay validation covers it and there is no float accumulation drift.
* `points/tick = floor(1000 * (SLOW_FLOOR + (1 - SLOW_FLOOR) * speedFactor))` with `speedFactor = clamp((speed - MIN)/(MAX - MIN), 0, 1)`. At minimum speed you earn 25% of full rate, so crawling is viable but always loses to flying fast; with `OVERSPEED` above `MAX` the factor clamps at 1 so diving is not a scoring exploit.
* Survival time is implicit (points accrue per tick); displaying `score / 1000` gives "seconds at full speed" which players understand.
* Optional v2, still deterministic: near-miss bonus `+NEAR_MISS_BONUS` when the collision query reports `distance < NEAR_MISS_RADIUS` and `speedFactor > 0.8`, with a cooldown of `NEAR_MISS_COOLDOWN` ticks (integer counter in state). Needs a distance query from the terrain module, not just a boolean.

## 8. Testing strategy

1. **Unit tests (pure core, run under Node, no DOM):** quaternion rotate/multiply against hand-computed values; `normalize` keeps norm within 1e-15; `dmath` functions vs `Math.*` within 2 ulp on a fixed grid (accuracy, not identity); FNV-1a known answers (`"" → 811c9dc5`, `"a" → e40c292c`, `"foobar" → bf9cf968`); PRNG known-answer vectors captured once and frozen; RLE and binary codec round-trips; scoring formula at min/max/over speed; `hashConstants` stability.
2. **Golden replays:** `test/replays/*.json` recorded in the game (a "save replay" dev button) and by the scripted pilot; the test replays each file and asserts every checkpoint and the final score. Regenerating goldens is an explicit command (`pnpm sim:regold`) that also bumps `simVersion`, so a silent behaviour change cannot pass review.
3. **Cross-engine job (CI):** the same golden replays run in Node and, via Playwright, in Chromium, Firefox and WebKit (`probes/determinism/06-cross-engine.mjs` is the template). Also run in the CI's oldest and newest supported Node. Any checksum difference fails the build. This is the test that would have caught the `Math.cos` drift.
4. **Property tests (fast-check):** for random `(seed, inputStream)`: `y ≤ CEILING`; unit quaternion within 1e-12; `MIN_SPEED*0.5 ≤ speed ≤ OVERSPEED`; score integer and monotone; no NaN; `step` on a cloned state equals `step` on the original (determinism); replaying twice yields identical checkpoint lists; decode(encode(inputs)) equals inputs. Probe `07` runs all of these.
5. **Static gate:** the ESLint rule from §3.4 plus a test that imports `sim/` in a bare Node context with `globalThis.Math.sin` replaced by a throwing stub, and runs a golden replay. If anything in the sim reaches for a forbidden function, the test fails immediately.
6. **Performance guard:** a benchmark test asserts ≥ 1 M ticks/s in Node so headless agents and validators stay cheap (probe: 6.9 M/s).

## 9. Random numbers

* **sfc32** for the in-sim stream: 128-bit state, ~2^128 period, passes PractRand, 1.6 ns/draw in the probe, integer-only, state is four u32 that serialise and hash trivially. xoshiro128** is an equal alternative; mulberry32 has only 32 bits of state and is fine for cheap effects but not as the main stream.
* **splitmix32** expands the single u32 replay seed into the four sfc32 words, then 12 warm-up draws.
* Floats: `u32 / 4294967296` (exact division by a power of two, deterministic).
* The stream lives in `SimState.rng` and is advanced only by `step`. Anything that consumes randomness outside `step` (renderer particles, UI) uses a **separate** generator, never the sim's.
* Terrain and obstacle placement use **stateless** hashing of `(seed, cellX, cellZ)` (probe `sim.mjs#hash2`) so chunks can be generated in any order by sim and renderer and still agree.
* `Math.random` is banned by lint in `sim/` and `terrain/`.

## 10. Headless use (validator and AI agents)

```ts
const sim = createSim({ seed, constants: C });
for (const input of agent.policy(sim.state)) { sim.step(input); recorder.push(input); }
const replay = recorder.finish(sim);     // valid leaderboard submission
```

* The same `sim/` module runs in Node with zero changes; the probe pilot drives 115,000 s of gameplay per second, ample for RL-style training loops or search-based agents.
* Agents observe `SimState` plus terrain queries; there is no privileged information, so a bot-produced replay validates exactly like a human one. If the leaderboard must distinguish humans, that is a policy/attestation problem, not a determinism one; the replay format gives the data (per-tick input statistics) to detect inhuman precision if desired.
* CLI: `canyon-replay validate <file>` (exit 0 / non-zero with the mismatch report), `canyon-replay run --seed N --agent <module>`.

## 11. Module layout (proposal)

```
src/sim/            pure, DOM-free, lint-gated
  constants.ts      C and hashConstants
  state.ts          SimState, createState, cloneState, checksum
  step.ts           the tick
  quat.ts           rotate, multiply, normalize (no trig)
  dmath.ts          dsin, dcos, datan2, dexp (fallback only)
  prng.ts           splitmix32, sfc32
  hash.ts           fnv1a32, hashState
  replay.ts         InputFrame, KEY bits, RLE, JSON/binary codecs, validate()
src/terrain/        pure; shared by sim and renderer (contract with terrain thread)
src/app/            loop, input sampler, renderer, recorder (browser only)
src/cli/            replay validator, headless runner (Node only)
test/replays/       golden replays
```

## 12. Open points for other threads

* **Terrain:** height/wall functions must be pure, integer-hash based, and evaluated in the sim (not from mesh or GPU data). Any smoothing must be polynomial. Chunk generation order must not matter.
* **Headless/CLI:** the validator is a thin wrapper over `sim/replay.ts#validate`; it needs no browser. WebKit coverage of the cross-engine job requires the Playwright system dependencies on the CI image.
* **Stack:** the sim package needs a DOM-free tsconfig and its own lint config; the test runner must run it in plain Node.

## Appendix: probe files

`probes/determinism/`: `01-basic-ops.mjs` (IEEE facts), `02-transcendentals.mjs` (poly vs `Math.*`, engine fingerprint), `03-prng.mjs`, `04-fnv.mjs`, `05-sim-replay.mjs` (record, replay, mutate, sizes, throughput), `06-cross-engine.mjs` (Playwright: Chromium/Firefox/WebKit vs Node), `07-property.mjs` (fast-check). Shared modules: `sim.mjs`, `replay.mjs`, `pilot.mjs`, `dmath.mjs`, `prng.mjs`, `hash.mjs`. Run order: `05` before `06`. Requires `npm install` in that directory and `playwright install chromium firefox webkit`.
