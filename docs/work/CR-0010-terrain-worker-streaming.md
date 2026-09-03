---
id: CR-0010
epic: EPIC-04
status: done
---
# CR-0010 Terrain worker streaming

**Goal.** Chunks are generated in a Web Worker by slab priority, transferred zero-copy, uploaded ≤ 4 per frame, and evicted behind the plane.

**Files.** `src/terrain/worker-protocol.ts` (message types), `src/app/terrain.worker.ts`, `src/app/terrainClient.ts` (`TerrainClient` with `setSlab(s)`, `takeReady(max)`, `evictBelow(s)`, `stats()`), `src/render/chunkStore.ts` (keyed meshes, add/remove), tests for the queue ordering (pure part), `docs/domain/terrain-streaming.md`.

**Acceptance.**
- Priority: nearest slab ahead first; a `slab` message drops queued work behind the plane.
- Resident slabs `s−1 … s+10`; `__game.chunkStats()` reports resident count, queued, generated, ms per chunk.
- In test mode `__game.step(n)` waits for the worker to catch up so frames are deterministic (`awaitSlabs(s+2)`).
- Memory: GPU buffers disposed on eviction; a 3 000-tick headless run does not grow resident chunk count beyond the ring.

**Verification.** headless run of 600 ticks with the scripted pilot shows the ring moving (stats in `frames.jsonl`).

**Delivered notes.** The client plans the ring (`SlabRing`, pure and tested)
and the worker builds slabs in request order, yielding between chunks so
cancels land. Worker frames hash identically to the in-thread frames
(`docs/evidence/2026-09-03-CR-0010`). Ring check, seed 2, 320×180, `step(300)` × 10:

| tick | z | resident | slabs | pending | generated | triangles |
|---|---|---|---|---|---|---|
| 300 | 759 | 74 | 12 | 0 | 74 | 252 970 |
| 1200 | 2956 | 71 | 12 | 0 | 302 | 230 388 |
| 2100 | 5263 | 79 | 12 | 0 | 551 | 224 740 |
| 3000 | 7626 | 72 | 12 | 0 | 815 | 229 988 |

Resident chunks stay between 71 and 102 with zero console errors.
