import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
import { biomeModes } from '../terrain/biomes.ts';
import { createChunkScratch, fillGrid } from '../terrain/chunk.ts';
import { GRID_LENGTH } from '../terrain/march.ts';
import { WasmField } from './wasmField.ts';

const WASM = path.resolve(
  new URL('../../wasm/field/target/wasm32-unknown-unknown/release/field.wasm', import.meta.url)
    .pathname,
);

async function load(): Promise<WasmField> {
  // The wasm is a build product of `pnpm build:wasm` (cargo); a missing file is a failure, not a skip.
  return WasmField.load(fs.readFileSync(WASM));
}

test('the wasm field fills chunks bit-identically to the TypeScript field in every biome', async () => {
  const wasm = await load();
  const js = createChunkScratch();
  const scratch = createChunkScratch();
  let compared = 0;
  let fullTotal = 0;
  for (const seed of [1, 2]) {
    for (const mode of biomeModes().map((m) => m.mode)) {
      // Chunks across the first gate and the first special segment, at several heights and x offsets.
      for (const [cx, cy, cz] of [
        [0, 0, 10],
        [-1, 1, 18],
        [1, 0, 19],
        [0, 1, 24],
        [-1, 0, 40],
        [0, 0, 41],
        [1, 1, 60],
      ] as const) {
        fillGrid(seed, cx, cy, cz, js, mode);
        wasm.fillGrid(seed, cx, cy, cz, scratch, mode);
        expect(scratch.full, `full count seed ${seed} mode ${mode} chunk ${cx},${cy},${cz}`).toBe(
          js.full,
        );
        const a = new Uint8Array(js.grid.buffer, 0, GRID_LENGTH * 8);
        const b = new Uint8Array(wasm.grid.buffer, wasm.grid.byteOffset, GRID_LENGTH * 8);
        let firstDiff = -1;
        for (let i = 0; i < a.length; i++) {
          if (a[i] !== b[i]) {
            firstDiff = i >> 3;
            break;
          }
        }
        expect(
          firstDiff,
          `seed ${seed} mode ${mode} chunk ${cx},${cy},${cz}: sample ${firstDiff} js ${js.grid[Math.max(firstDiff, 0)]} wasm ${wasm.grid[Math.max(firstDiff, 0)]}`,
        ).toBe(-1);
        compared++;
        fullTotal += js.full;
      }
    }
  }
  expect(compared).toBeGreaterThan(50);
  expect(fullTotal).toBeGreaterThan(50000);
}, 120000);
