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
