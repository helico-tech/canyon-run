# CR-0017 evidence — cave biome

`node tools/headless/run.ts --seed 1 --skip 840 --frames 240 --every 40 --out runs/cr17`
(seed 1, z ≈ 2250–2620, inside the first special segment). All gates ok.

- `cave-sheet.png`: low elliptic tube, stalactites and stalagmites, columns,
  dark blue rock with cyan strata bands, dense blue fog.
- `cave-frame.png`: a single frame with the HUD.
- `blend-sheet.png`: the canyon-to-cave transition (z ≈ 1100–1400).

Gate changes made here: the "terrain in the bottom band" and "not fogged out"
checks compared pixel colours with the fog colour, which dark biomes defeat
(fogged floor ≈ fog colour); the bottom-band check now requires edge density,
and the fog-colour check was dropped in favour of the existing edge density and
colour variety gates. The fog colour itself now comes from the plane's z.
