# Headless validation

How an agent (or CI) runs the game without a screen. Decision: ADR 0003.

## Test mode

`?test=1` (or an injected `window.__replay`) makes `src/app/main.ts` skip the
animation loop, size the canvas from `w`/`h` (default 640×360), create the WebGL
context with `preserveDrawingBuffer`, and install `window.__game`:

| Call | Effect |
|---|---|
| `step(n)` | runs n sim ticks (scripted pilot unless `setInput` was called), updates the chunk ring, renders once, returns the state snapshot |
| `state()` | `{ tick, alive, x, y, z, speed, score, proximity, checksum }` |
| `setInput({keys,dx,dy} \| null)` | fixed input for following ticks; null returns control to the pilot |
| `frameHash()` | FNV-1a over the RGBA frame buffer, hex |
| `readPixel(x, y)` | `[r,g,b,a]` at canvas pixel (y down) |
| `dataURL()` | PNG of the canvas |
| `chunkStats()` | resident chunks, generated count, generation ms, triangles |

`window.__info` holds the WebGL renderer string (SwiftShader in headless
Chromium) and the sim version.

## Tools

```
pnpm build
node tools/headless/shot.ts --seed 1 --ticks 300 --out runs/shot.png   # one frame + probes + stats
```

`tools/headless/serve.ts` serves `dist/` over HTTP (Playwright refuses `file:`
URLs); `tools/headless/browser.ts` opens the page, waits for `__game.ready`, and
collects console errors while ignoring the known SwiftShader ReadPixels warning.

## Replay-driven runs and gates

```
pnpm headless -- --seed 1 --frames 300 --every 30 --out runs/seed1          # pilot flies seed 1
pnpm headless -- --replay tests/replays/seed-1.json --frames 300 --out runs/r1   # drives a recorded replay
pnpm headless:golden                                                        # rewrite tests/golden/<renderer>.json
pnpm test:e2e                                                               # build + Playwright spec (gates + golden hashes)
```

`tools/headless/run.ts` steps the sim one tick per frame (settling the chunk
ring first), records `{frame, tick, hash, checksum, x, y, z, speed, score,
proximity}` per frame in `frames.jsonl`, dumps a PNG every `--every` frames,
computes `stats.json` (mean luminance, unique 4-bit colours, edge density, fog
fractions, dominant colours, 3×3 means), builds `sheet.png`, and writes
`gate.json`. It exits non-zero when a gate fails.

Gates (`tools/headless/gate.ts`), per dumped frame: not fogged out, terrain in
the bottom band, colour variety (> 40 quantised colours; a single biome
quantises to roughly 80–120), edge density 1–40 %, exposure 20–200. Per run:
horizon glow visible somewhere, frame hash changes between frame 0 and 60, zero
console errors, and the browser's final sim checksum equals Node's.

Golden hashes are keyed by renderer (`swiftshader`, `llvmpipe`, …); a run on a
renderer without a golden skips the exact comparison with a notice. Regenerate
deliberately with `pnpm headless:golden` after an intentional visual change.
