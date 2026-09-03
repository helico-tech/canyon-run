# CR-0040 evidence — gate frame visibility (2026-09-03)

`node tools/headless/run.ts --seed 1 --skip 390 --frames 100 --every 20`,
before and after, approaching the first gate at 1200 u.

- `before-gate.png`: 3 u pillars barely register at f40 (z 1125); the
  boundary reads from the palette change alone.
- `after-gate.png`: 5 u pillars in the next biome's accent and a sill stripe
  across the floor between them, visible from f20 (z 1069) and unmistakable at
  f40 and f60; the HUD countdown (CR-0039) sits above the reticle.
- `after-gate.json`: every gate ok, browser checksum equal to Node; the
  SwiftShader render golden and the sim goldens were regenerated because the
  field changed at every gate.
