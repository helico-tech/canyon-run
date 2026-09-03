# Biomes

Source: `src/terrain/biomes.ts`, `src/terrain/field.ts` (`FieldContext`),
`src/render/atmosphere.ts`. Decision: ADR 0004 §6.

## Sequencing

```
z:  0 ──── 1200 ──────────── 3600 ──── 4800 ──────────── 7200 ...
    hub    special (by hash)  hub       special           hub
```

Even segments are always the canyon hub (1200 u); odd segments pick one of
the registered `SPECIALS` with `hash1(segmentIndex, seed)`. Blend zones are
320 u wide, centred on each boundary, with `t = smoothstep` from the earlier
biome to the later one. With no specials registered every segment is canyon
and blends are identities, so registering biomes never changes canyon output.

## Blending

`FieldContext.density` evaluates **both** biome fields at the point and lerps
the densities, then carves the core tube of the **mixed** parameters
(`mixParams` lerps every number). Frequencies therefore never slide; the
corridor never closes because the mixed core is always air (tested across a
synthetic blend). Features of both biomes exist in the zone and fade with the
lerp. Colours look up both palettes and lerp; fog, sky, sun and light
intensities lerp per frame from the plane's z.

## Contract for a biome definition

`BiomeDef = { id, name, params: FieldParams, palette: BiomePalette, atmosphere }`.
All biomes share the spine wander values in `FieldParams` (`wander*`,
`floorWander*`, `width*`) so the corridor centreline is continuous; halfWidth,
height, coreYFrac, detail amplitudes and feature settings are per biome.

## Registered biomes

| # | Name | Corridor | Field extras | Features | Look |
|---|---|---|---|---|---|
| 0 | Canyon (hub) | slot, W 40, H 110, overhang lip | warp 10, ridges 7 @ 28 (vertical flutes) | pillars, boulders, arches | warm strata, orange haze |
| 1 | Cave | elliptic tube, W 30, H 62 (`tubeness 1`) | stalactites 9, stalagmites 6 (`spikeLen 8`), ridges 5 @ 18 | columns (0.5 @ 40 u), boulders, dead-end side tunnels (0.4 per 200 u) | blue rock, cyan bands, dense blue fog, cool light |
| 2 | Crystal spires | slot, W 36, H 120 | warp 8, smooth ridges 3 @ 34 | hexagonal crystals on the floor (0.55 @ 24 u) and walls (0.3), tilted from a literal (cos, sin) table, few pillars/arches | dark violet basalt, neon cyan/magenta/lime crystal faces, magenta sun |
| 3 | Lava rift | deep near-vertical slot, W 30, H 140 | warp 5, ridges 9 @ 40 stretched flat (horizontal strata), detail 2, flat floor | rock islands (boulders 4–10 u, 0.3 @ 26 u), arch bridges (0.5 per 200 u), few pillars | charcoal walls with orange seams, bright lava floor, dark red fog, orange light from below |
