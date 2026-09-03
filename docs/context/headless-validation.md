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
