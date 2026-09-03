# Terrain field

Source: `src/terrain/{params,spine,features,field}.ts`. Research: `docs/research/2026-09-03-03-terrain-generation.md`. Decision: ADR 0004.

`d(seed, x, y, z)`: **d > 0 rock, d < 0 air**, iso-surface at 0. Distance-like
in air (roughly metres to rock), which the sim uses for proximity.

## Spine (functions of z only)

| Symbol | Formula (canyon) |
|---|---|
| `cx` | `80·fbm1(z/800, 2 oct) + 12·vnoise1(z/260)` |
| `floorY` | `30·fbm1(z/520, 2 oct)` |
| `ceilY` | `floorY + 110` |
| `coreY` | `floorY + 0.45·110` |
| `hw` | `40·(1 + 0.35·vnoise1(z/230))` |

Curvature bound per term is `11.5·A/λ²`; the two lateral terms give a minimum
bend radius of about 230 u, which a plane at 170 u/s with 100°/s pitch
authority turns with margin (turn radius ≈ 97 u).

## Base and detail

```
h        = (y − floorY) / H
profile  = 1 + 0.3·S(0,1,h) − 0.6·S(0.7,1,h)         walls lean out, then curl in (overhang lip)
base     = max(|x − cx| − hw·profile, floorY − y, y − ceilY)

warp     : (px, py) = (x, y) + 10·fbm3(p/45, 2 oct)   (x and y only)
ridges   : sdWall  = |px − cx| − hw·profile(h(py)) + 7·(2·ridged3(px/28, py/80, z/28, 3 oct) − 1)
floor    : sdFloor = floorY − py + 5·fbm2(px/33, z/33, 2 oct)
ceiling  : sdCeil  = py − ceilY + 4·fbm2(px/25, z/25, 2 oct)
combine  : d = smax(smax(sdWall, sdFloor, 8), sdCeil, 8) + 1.5·noise3(p/7)
features : d = max(d, −featuresSD(p))                add rock
core     : d = min(d, len(x − cx, y − coreY) − 12)   guaranteed air along the spine
```

The shell bound `B = 1.5·warp + ridge + floor + ceil + detail + k/4 ≈ 34.5`
guarantees `d ≥ base − B`; samples with `base > B + cellDiag` are deep rock and
samples with `base < −B − cellDiag` are deep air (only features can add rock
there), so the chunk builder evaluates the full field only in the shell.

## Where the roof and floor really are

Domain warp moves the sample point by up to `0.92·warpAmp ≈ 9 u` in y and the
roof noise adds ±4 u, so the rock roof surface sits anywhere in
`ceilY ± 14`. The same holds for the floor. Consequences: the sim's ceiling
clamp must sit at least 16 u below `ceilY` (`CEIL_MARGIN`), and tests that ask
"is this rock?" probe 20 u beyond the nominal surfaces.

## Features

Placed on integer cells hashed with the seed; parameters come from the cell hash.

| Feature | Cells | Probability | Shape |
|---|---|---|---|
| Pillar | 56 u (x, z) | 0.35 | vertical capsule, `r = 5·[0.7, 1.3]`, radius bulged by ±25 % noise |
| Boulder | 20 u (x, z) | 0.25 | sphere at `floorY + 0.4·r`, `r ∈ [2, 6]`, ±20 % noise |
| Arch | 256 u (z) | 0.3 | torus across the corridor at `floorY + 0.25·H`, ring radius `1.1·hw`, tube `r ∈ [5, 9]` |

`featuresSD` returns the nearest feature's signed distance **clamped to
`FEATURE_CLAMP = 40`**. Every evaluator gathers features whose reach
(`effective radius + 40`) touches its region, so a point evaluates to the same
bits whether the gather box was one point (simulation) or a whole chunk
(worker). `field.test.ts` proves this on a 10 000-point grid.

## Determinism rules

Only int32 ops and f64 `+ − × ÷ sqrt floor abs min max`; hashes on integers;
noise seeds per role are `seed ^ constant`; no time, no caches that change results.
