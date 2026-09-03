---
id: CR-0010
epic: EPIC-04
status: todo
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
