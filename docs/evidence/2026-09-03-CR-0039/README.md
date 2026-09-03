# CR-0039 evidence — biome label and gate countdown (2026-09-03)

`node tools/headless/run.ts --seed 1 --skip 330 --frames 200 --every 40`,
before and after the change, same seed and frames.

- `before-gate.png`: nothing announces the boundary at 1200 u; the palette
  change is the only cue.
- `after-gate.png`: "gate in 243 u" (f40), "131 u" (f80), "19 u" (f120)
  centred above the reticle, gone after the boundary; the biome label bottom
  right reads CANYON and switches to HOODOO DESERT from f160.
- `after-gate.json`: every gate ok, browser checksum equal to Node.
