# CR-0011 evidence — headless runner, gates and contact sheet

`node tools/headless/run.ts --seed 1 --frames 120 --every 30 --out runs/cr11` at
640×360 on headless Chromium (SwiftShader): 6275 ms for 120 rendered frames,
all 29 gates ok.

`sheet.png` is the contact sheet the agent reviews (labels: frame, tick, z).

| frame | mean luminance | unique 4-bit colours | edge density % | fog fraction |
|---|---|---|---|---|
| 0 | 46.8 | 87 | 2.08 | 0.0096 |
| 30 | 45.8 | 87 | 2.14 | 0.0047 |
| 60 | 43.9 | 77 | 2.28 | 0.0015 |
| 90 | 41.1 | 87 | 1.74 | 0.0035 |
| 119 | 45.8 | 88 | 2.37 | 0.0066 |

Run-level gates: horizon glow visible (max fog fraction), temporal change
between frame 0 and 60, zero console errors, and the browser's final sim
checksum equals Node's re-simulation of the same pilot run.

Golden frame hashes for this renderer live in `tests/golden/swiftshader.json`
and are compared by `tests/e2e/render.spec.ts`.
