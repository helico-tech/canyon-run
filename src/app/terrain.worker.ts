// Terrain worker: builds requested slabs chunk by chunk, yielding between chunks
// so cancel and build messages are honoured promptly.
import { buildChunk, createChunkScratch, fillGrid, slabCandidates } from '../terrain/chunk.ts';
import type { GridFiller } from '../terrain/chunk.ts';
import type { FromWorker, ToWorker } from '../terrain/worker-protocol.ts';
import { WasmField } from './wasmField.ts';
import fieldWasmUrl from '../terrain/field.wasm?url';

const scratch = createChunkScratch();
// The wasm field takes over once it has loaded (ADR 0009); until then, and if
// loading fails, the TypeScript field builds identical grids.
let fill: GridFiller = fillGrid;
let usingWasm = false;
WasmField.load(fetch(fieldWasmUrl))
  .then((wasm) => {
    scratch.grid = wasm.grid;
    fill = (seed, cx, cy, cz, s, mode) => wasm.fillGrid(seed, cx, cy, cz, s, mode);
    usingWasm = true;
  })
  .catch((err: unknown) => {
    console.warn('field.wasm unavailable, using the TypeScript field', err);
  });
let seed = 0;
let mode = 0;
const queue: number[] = [];
let running = false;

const post = (msg: FromWorker, transfer: Transferable[] = []): void => {
  (self as unknown as Worker).postMessage(msg, transfer);
};

function buildSlab(cz: number): void {
  const t0 = performance.now();
  const candidates = slabCandidates(seed, cz, mode);
  let chunks = 0;
  for (const [cx, cy] of candidates) {
    const mesh = buildChunk(seed, cx, cy, cz, scratch, mode, fill);
    if (!mesh) continue;
    chunks++;
    post({ type: 'chunk', cx, cy, cz, tris: mesh.tris, pos: mesh.pos, rgba: mesh.rgba }, [
      mesh.pos.buffer,
      mesh.rgba.buffer,
    ]);
  }
  post({
    type: 'slabDone',
    cz,
    chunks,
    candidates: candidates.length,
    ms: performance.now() - t0,
    wasm: usingWasm,
  });
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
    mode = msg.mode;
    queue.length = 0;
  } else if (msg.type === 'build') {
    if (!queue.includes(msg.cz)) queue.push(msg.cz);
    pump();
  } else if (msg.type === 'cancelBelow') {
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i]! < msg.cz) queue.splice(i, 1);
  }
};
