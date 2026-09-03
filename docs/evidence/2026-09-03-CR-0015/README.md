# CR-0015 evidence — cross-engine replay determinism

`pnpm exec playwright test tests/e2e/cross-engine.spec.ts` (2026-09-03):

| Engine | Replay | Ticks | Final checksum equals golden | Score equals golden | Time |
|---|---|---|---|---|---|
| Node 24 (V8) | seed 1, 2, 3 | 1800 each | yes | yes | 44 ms each |
| Chromium 151 (V8, WebGL rendering on) | seed 1 | 1800 | yes | yes | 8.8 s |
| Chromium 151 | seed 2 | 1800 | yes | yes | 8.6 s |
| Chromium 151 | seed 3 | 1800 | yes | yes | 8.1 s |
| Firefox 153 (SpiderMonkey, sim only `?nogl=1`) | seed 1 | 1800 | yes | yes | 19 s |
| Browser-recorded replay (Chromium, seed 5, 400 ticks) | validated in Node | 400 | verdict `ok` | yes | 1.8 s |

Headless Firefox on this VM cannot create any GL context
(`FEATURE_FAILURE_WEBGL_EXHAUSTED_DRIVERS`), so the Firefox run uses the null
renderer; the sim path is identical.
