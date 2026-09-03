# Replays

A run is `(seed, per-tick inputs)`. `src/sim/replay.ts` records, encodes and
validates; `src/cli/replay.ts` exposes it on the command line.

```
node src/cli/replay.ts run --seed 1 --ticks 1800 --out run.json [--throttle vary|full|idle]
node src/cli/replay.ts validate run.json      # exit 0 and {"verdict":"ok",...} or exit 1 with the reason
pnpm sim:regold                               # regenerate tests/replays/*.json and bump SIM_VERSION
```

## Format v1

```json
{ "format": "canyon-replay/1", "simVersion": "0.1.1", "constantsHash": "…", "tickRate": 60,
  "seed": 1, "ticks": 1800, "finalScore": 1234567, "finalChecksum": "…",
  "runs": [[count, keys, dx, dy], …], "checkpoints": [[60, "…"], …], "meta": {} }
```

- `biomeMode` (optional, 0 when absent) selects the biome sequence; it is hashed into every checkpoint.
- `runs` is run-length encoded over identical `(keys, dx, dy)`; reserved key bits (8–15) must be zero.
- `checkpoints` hold the FNV-1a state checksum every 60 ticks and at the end.
- Validation re-simulates from the seed and reports `ok`, `checkpoint-mismatch`
  (with the first bad tick), `score-mismatch`, `version-mismatch` (sim version,
  constants hash or tick rate) or `malformed`. The claimed score is never trusted.

## Goldens

`tests/replays/seed-{1,2,3}.json` are 1800-tick pilot runs. `src/sim/golden.test.ts`
replays them; any behavioural change in `src/sim` or `src/terrain` breaks them
by design. Regenerate with `pnpm sim:regold`, which refuses on a dirty tree and
bumps `SIM_VERSION`, so the change is visible in review.

## In the browser

- Every run is recorded (`Game.replay()`); the run-over panel's **copy replay**
  button puts the JSON on the clipboard, and `window.__game.replay()` returns
  it in test or debug mode.
- Playback: `?replay=<url>` fetches a replay file (the replay's seed wins over
  the URL seed), or inject `window.__replay` before load. The HUD shows a
  replay badge and player input is ignored.
- `tests/e2e/cross-engine.spec.ts` replays the goldens in headless Chromium
  (and Firefox when it can launch) and compares the final checksum and score
  with the file, and validates a browser-recorded replay in Node.
