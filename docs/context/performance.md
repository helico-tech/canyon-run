# Performance record

Numbers are measured on the development VM (8 vCPU, no GPU, Node 24) and
vary ±40 % run to run. Never gate tests on them.

## Terrain generation (JS, single thread)

`node tools/terrain-census.ts <seed> 10` — 10 slabs = 640 u of lookahead.

| Date | Change | ms / candidate chunk | ms / slab | tris / slab | non-empty / slab |
|---|---|---|---|---|---|
| 2026-09-03 | CR-0006 first version | 16.6 | 250 | 18 400 | 7.4 |
| 2026-09-03 | CR-0006 feature noise early-out | 12.1 | 185 | 18 400 | 7.4 |

Reading: at 170 u/s the plane consumes 2.65 slabs/s, so one JS worker spends
about 490 ms per second (≈ 49 % of a core) keeping the ring full. Research 03
measured a wasm port of the field at 2.9× faster; leaner octaves or a second
worker are the other levers (CR-0027).

Resident geometry for 640 u: ~184 k triangles, 8.4 MB of vertex data.

## Per-biome chunk cost (2026-09-03, CR-0021, `scratchpad/census-biomes.ts`, 4 slabs each)

| Biome | Candidates / slab | Non-empty / slab | Triangles / slab | Max tris / chunk | ms / candidate | ms / slab |
|---|---|---|---|---|---|---|
| canyon (hub) | 15 | 7.4 | 18 400 | 5 681 | 12.1 | 185 |
| cave | 9 | 3.3 | 10 700 | 10 114 | 12.4 | 112 |
| crystal spires | 16 | 6.3 | 17 100 | 5 116 | 10.9 | 174 |
| lava rift | 12 | 9.8 | 20 100 | 5 111 | 13.6 | 163 |
| hoodoo desert | 22 | 16 | 49 100 | 9 070 | 17.8 | 390 |
| floating archipelago | 26 | 11.8 | 38 500 | 7 610 | 16.3 | 428 |

At 170 u/s (2.65 slabs/s) the wide halls need ~1.0–1.1 s of worker time per
second of flight: a single JS worker cannot keep the ring full there. See the
issue filed for CR-0027 (second worker or wasm field).

## Two terrain workers (2026-09-03, CR-0027)

`TerrainClient` now runs two workers on machines with 4+ cores and deals slabs
round-robin (`?workers=N` overrides). Wall time to keep the ring full while
advancing 100 ticks (≈ 280 u, 4.4 slabs) through the hoodoo desert (seed 4),
measured with `scratchpad/bench-workers.ts`:

| z after 100 ticks | 1 worker | 2 workers |
|---|---|---|
| 2064 | 759 ms | 481 ms |
| 2342 | 561 ms | 316 ms |
| 2624 | 618 ms | 349 ms |
| 2904 | 1114 ms | 676 ms |

100 ticks are 1.67 s of flight, so generation now needs 20–40 % of wall time in
the heaviest biome instead of 35–65 %; the ring no longer drains at top speed.
Headless frame time at 640×360 stays 25–45 ms per frame on SwiftShader
(validation-grade, not real-time; real GPUs are far faster).
