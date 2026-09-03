# CR-0032 evidence — adversary rendering and biome sets

- `trench-adversaries.png`: `node tools/headless/run.ts --seed 3 --biome trench --skip 300 --frames 300 --every 30`.
  Station frames (posts and lintel in the biome accent) fade in ahead; spinning
  blades hang beside the core as bright unlit bars that breathe toward white.
  The test API listed the same two stations (z 723 and 890) the sim gathered.
- `hoodoo-adversaries.png`: `--seed 4 --biome hoodoo`: bouncing blocks and
  orbiting shards in the wide hall.
- All gates ok in both runs; the HUD gate now checks brightness because the
  proximity glow overlay can tint the anchor pixel.

Census of decoded stations per 6000 u (three seeds, forced modes):
cave 8.0 (sweeping spinning blades), crystal spires 5.0 (drifting hoops),
lava rift 4.0 (pistons), hoodoo desert 11.0 (blocks, orbiting shards),
floating archipelago 7.3 (shards, hoops), trench run 13.0 (jaws, blades).
