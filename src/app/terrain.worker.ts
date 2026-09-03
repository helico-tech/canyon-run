// Terrain worker: builds requested slabs chunk by chunk, yielding between chunks
// so cancel and build messages are honoured promptly.
import { buildChunk, createChunkScratch, slabCandidates } from '../terrain/chunk.ts';
import type { FromWorker, ToWorker } from '../terrain/worker-protocol.ts';

const scratch = createChunkScratch();
let seed = 0;
const queue: number[] = [];
let running = false;

const post = (msg: FromWorker, transfer: Transferable[] = []): void => {
  (self as unknown as Worker).postMessage(msg, transfer);
};

function buildSlab(cz: number): void {
  const t0 = performance.now();
  const candidates = slabCandidates(seed, cz);
  let chunks = 0;
  for (const [cx, cy] of candidates) {
    const mesh = buildChunk(seed, cx, cy, cz, scratch);
    if (!mesh) continue;
    chunks++;
    post({ type: 'chunk', cx, cy, cz, tris: mesh.tris, pos: mesh.pos, rgba: mesh.rgba }, [
      mesh.pos.buffer,
      mesh.rgba.buffer,
    ]);
  }
  post({ type: 'slabDone', cz, chunks, candidates: candidates.length, ms: performance.now() - t0 });
}

function pump(): void {
  if (running) return;
  running = true;
  const next = (): void => {
    const cz = queue.shift();
    if (cz === undefined) {
      running = false;
      return;
    }
    buildSlab(cz);
    setTimeout(next, 0);
  };
  setTimeout(next, 0);
}

self.onmessage = (e: MessageEvent<ToWorker>): void => {
  const msg = e.data;
  if (msg.type === 'seed') {
    seed = msg.seed >>> 0;
    queue.length = 0;
  } else if (msg.type === 'build') {
    if (!queue.includes(msg.cz)) queue.push(msg.cz);
    pump();
  } else if (msg.type === 'cancelBelow') {
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i]! < msg.cz) queue.splice(i, 1);
  }
};
