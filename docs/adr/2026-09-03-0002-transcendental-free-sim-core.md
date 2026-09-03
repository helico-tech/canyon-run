---
status: accepted
date: 2026-09-03
deciders: agent (autonomous mandate from the project owner)
---

# 0002: Deterministic sim core — binary64, no transcendentals, 60 Hz

## Context

A run must be fully described by `(seed, per-tick inputs)` and replay
bit-identically on any engine, so scores can be validated by re-simulation and
regressions caught by golden replays. Probes on this machine
(`docs/research/2026-09-03-04-determinism-replay.md`) showed:

- `Math.cos(0.1)` differs by 1 ulp between Node 24's V8 and Chromium 151's V8.
  "Same engine, same result" is false even across V8 versions.
- `Math.hypot` differs between V8 and SpiderMonkey.
- IEEE 754 `+ - * / sqrt`, `Math.fround`, floor/round/abs/min/max, and int32 ops
  are identical everywhere. No FMA contraction in any engine.
- A sim built only from those replayed 7200 ticks bit-identically on Node 24,
  Chromium 151, and Firefox 153 (all 120 checkpoints equal).

## Decision

1. **Numeric model:** plain `number` (binary64). Inside `src/sim/` and
   `src/terrain/` only `+ - * / %`, `Math.sqrt`, `Math.floor/ceil/round/trunc/abs/min/max/sign`,
   `Math.imul/clz32`, bitwise ops, and typed arrays are allowed.
   `Math.sin/cos/tan/atan2/exp/log/pow/hypot/cbrt/random`, the `**` operator,
   `Date`, and `performance` are banned by lint in those directories.
2. **Orientation:** unit quaternion with a first-order body-rate update and
   renormalisation each tick. Bank angle for turn coupling and auto-level is the
   `y` component of the body right-vector, so no trigonometry is needed.
3. **Tick rate:** 60 Hz, `DT = 1/60` as a literal. Accumulator loop with at most
   5 catch-up ticks per frame; the clock decides how many ticks run, never what a
   tick does. All time constants are stored per tick as literals; nothing is
   derived with `Math.exp` at load time.
4. **Input per tick:** `{ keys: u16 bitflags, dx: i16, dy: i16 }`. Keys are
   latched; mouse deltas are accumulated and rounded to integers. Mouse gain is a
   sim constant so replays do not depend on player settings.
5. **Randomness:** sfc32 seeded from splitmix32, state stored in `SimState` and
   hashed. Terrain uses stateless integer hashing of `(seed, cell)`. Cosmetic
   effects use a separate generator.
6. **Terrain in the sim:** collision and proximity sample the same pure density
   function the mesher uses. The sim never reads mesh or GPU data.
7. **Replay v1:** JSON with RLE runs `[count, keys, dx, dy]`, a header
   (`format`, `simVersion`, `constantsHash`, `seed`, `tickRate`), checkpoints every
   60 ticks (FNV-1a 32 over the little-endian float bits of the state vector plus
   PRNG state and tick), and `finalScore`. The validator re-simulates and never
   trusts the claimed score.
8. **Scoring inside the tick** in integer milli-points so replay validation
   covers it.

Fixed-point arithmetic and a Rust/wasm core were considered and rejected for v1:
no benefit once the core is transcendental-free. Rust + `libm` remains the escape
hatch; `src/sim/` stays small and platform-free so a port is bounded.

## Consequences

- The sim runs unchanged in Node and the browser; tests run under Vitest with no DOM.
- A cross-engine test (Node + Chromium, Firefox when available) replays golden
  files and compares checkpoints. It is the test that catches a stray `Math.sin`.
- Changing any constant changes `constantsHash` and invalidates old replays by design.
- Render-side effects (camera lag, FOV, shake) may use any `Math.*` because they
  never feed back into the sim.
