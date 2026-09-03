// Messages between the main thread and the terrain worker (spec §6.4).
// The client plans which slabs it wants; the worker builds them in request order.

export type ToWorker =
  | { type: 'seed'; seed: number; mode: number }
  | { type: 'build'; cz: number }
  | { type: 'cancelBelow'; cz: number };

export interface ChunkMessage {
  type: 'chunk';
  cx: number;
  cy: number;
  cz: number;
  tris: number;
  pos: Float32Array;
  rgba: Uint8Array;
}

export type FromWorker =
  ChunkMessage | { type: 'slabDone'; cz: number; chunks: number; candidates: number; ms: number };
