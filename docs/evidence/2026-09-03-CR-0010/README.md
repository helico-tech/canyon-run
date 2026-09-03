# CR-0010 evidence — worker streaming reproduces the in-thread frames

`node tools/headless/shot.ts --seed 1 --ticks 0|300` after moving chunk
generation to the Web Worker:

| Ticks | Frame hash (worker) | Frame hash (in-thread, CR-0009) | Resident | Triangles | Pending slabs | Console errors |
|---|---|---|---|---|---|---|
| 0 | `be6a123d` | `be6a123d` | 86 | 225 786 | 0 | 0 |
| 300 | `a43d1043` | `a43d1043` | 97 | 251 498 | 0 | 0 |

Identical hashes: the ring built by the worker contains exactly the chunks the
synchronous builder produced. Generation of the 12-slab ring took ~1.3 s in the
worker (~110 ms per slab).

The 3000-tick ring check (`step(300)` × 10 on seed 2, 320×180) is recorded in the
story file: resident chunks and slab counts stay bounded as the plane advances.
