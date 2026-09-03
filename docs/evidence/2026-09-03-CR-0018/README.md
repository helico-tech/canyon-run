# CR-0018 evidence — crystal spires biome

`node tools/headless/run.ts --seed 1 --skip 840 --frames 240 --every 40 --out runs/cr18`
(seed 1's first special segment is crystal spires; `node tools/biome-seeds.ts`
lists which seeds get which biome). All gates ok.

`spires-sheet.png`: violet basalt with smooth walls, hexagonal crystals in cyan,
magenta and lime growing from the floor and walls, magenta sun and violet fog.
The first attempt was nearly black with floating crystals; the palette and
lights were brightened and crystal bases buried 12 u below the nominal floor
so the warped floor never leaves them hanging.
