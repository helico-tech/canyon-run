# Terrain colour

Source: `src/terrain/{palette,colour,chunk}.ts`. Colours are baked per face
when a chunk is built, so rendering needs no textures and no lighting bake.

## Rule (per triangle)

```
n        = face normal from the winding (cross product)
material = n.y > 0.6 ? FLOOR : n.y < −0.35 ? CEILING : WALL
h        = clamp((centroid.y − floorY(z)) / H, 0, 1)
band     = frac(h · bands + 0.4 · noise3(centroid / 50))       strata, wobbled
rgb      = ramp[material](material == WALL ? band : h)
rgb     *= 0.9 + 0.2 · unit01(hash3(faceKey, chunkKey, seed))  ±10 % per-face value jitter
```

All three vertices of a face carry the same rgba, so the interpolated varying
is constant and the shading is flat. Alpha is 255.

## Canyon palette

| Role | Stops |
|---|---|
| wall | `#C4543A → #E48440 → #F2B25C → #A03C46` (7 bands) |
| floor | `#D6B060 → #E8CA78` |
| ceiling | `#5C283C → #8C3C50` |
| horizon / fog | `#FF9A5C` |
| sky top | `#2D1B4E` |
| sun | `#FFE9A8` |
| accent | `#2EE6D6` |

## Chunk builder

`buildChunk(seed, cx, cy, cz, scratch)` fills the 33³ grid (shell skip:
`base > B + cellDiag` is deep rock, `base < −B − cellDiag` is deep air with
features only), runs marching cubes, bakes colours, and returns exact-size
`pos` (f32, chunk-local) and `rgba` (u8) buffers or `null` when empty.
`slabCandidates(seed, cz)` lists chunks inside the padded corridor envelope,
nearest the spine first. `tools/terrain-census.ts` prints the cost table.
