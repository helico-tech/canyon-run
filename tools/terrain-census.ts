// Prints chunk generation cost and triangle counts per slab.
//   node tools/terrain-census.ts [seed] [slabs]
import { buildChunk, createChunkScratch, slabCandidates } from '../src/terrain/chunk.ts';

const seed = Number(process.argv[2] ?? 1);
const slabs = Number(process.argv[3] ?? 10);
const scratch = createChunkScratch();
let totalTris = 0;
let totalMs = 0;
let totalCandidates = 0;
let totalNonEmpty = 0;
let maxTris = 0;
console.log(`seed ${seed}, ${slabs} slabs (${slabs * 64} u)`);
console.log('slab  cand  nonEmpty   tris    ms   ms/cand');
for (let cz = 0; cz < slabs; cz++) {
  const cands = slabCandidates(seed, cz);
  let tris = 0;
  let nonEmpty = 0;
  const t0 = performance.now();
  for (const [cx, cy] of cands) {
    const m = buildChunk(seed, cx, cy, cz, scratch);
    if (!m) continue;
    nonEmpty++;
    tris += m.tris;
    maxTris = Math.max(maxTris, m.tris);
  }
  const ms = performance.now() - t0;
  console.log(
    `${String(cz).padStart(4)}  ${String(cands.length).padStart(4)}  ${String(nonEmpty).padStart(8)}  ${String(tris).padStart(5)}  ${ms.toFixed(0).padStart(4)}  ${(ms / cands.length).toFixed(2).padStart(7)}`,
  );
  totalTris += tris;
  totalMs += ms;
  totalCandidates += cands.length;
  totalNonEmpty += nonEmpty;
}
console.log(
  `total: ${totalCandidates} candidates, ${totalNonEmpty} non-empty, ${totalTris} tris (max ${maxTris}/chunk), ${totalMs.toFixed(0)} ms, ${(totalMs / totalCandidates).toFixed(2)} ms per candidate, ${((totalTris * 48) / 1048576).toFixed(1)} MB`,
);
