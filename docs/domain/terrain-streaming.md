# Terrain streaming

Source: `src/app/{slabRing,terrainClient,terrain.worker,world}.ts`,
`src/terrain/worker-protocol.ts`. Decision: ADR 0004 §4.

## Ring

The plane is in slab `s = floor(z / 64)`. The client keeps slabs `s − 1 … s + 10`
requested. `SlabRing` (pure, unit-tested) decides what to request when `s`
changes: the new far slab, in nearest-first order on the first call, and
which slabs to cancel and evict behind.

## Protocol

```
main → worker : { type: 'seed', seed }            resets the queue
main → worker : { type: 'build', cz }             append a slab (request order = priority)
main → worker : { type: 'cancelBelow', cz }       drop queued slabs behind the plane
worker → main : { type: 'chunk', cx, cy, cz, tris, pos, rgba }   buffers transferred, not copied
worker → main : { type: 'slabDone', cz, chunks, candidates, ms }
```

The worker builds one chunk at a time and yields (`setTimeout 0`) between
chunks so cancels arrive promptly. Chunks are pure functions of
`(seed, cx, cy, cz)`, so order and cancellation never change what appears.

## Main thread

`World.update(z)` plans, uploads at most 4 delivered chunks per frame, and
evicts meshes below `s − 1`. `World.settle(z)` waits for the ring to complete
and uploads everything; test mode calls it before every render so headless
frames are deterministic. `chunkStats()` reports resident chunks, pending
slabs, generated count, generation ms and triangles.
