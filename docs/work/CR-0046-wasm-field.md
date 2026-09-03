---
id: CR-0046
epic: EPIC-08
status: done
---
# CR-0046 Density field in wasm, bit-identical, JS fallback

**Goal.** Close issue `2026-09-03-wasm-field-port`: the chunk density field
in wasm, bit-identical to the TypeScript field, used by the terrain workers
with the TypeScript field as fallback and oracle (ADR 0009).

**Files.** `wasm/field/` (Rust crate: `noise.rs`, `density.rs`, `lib.rs`;
no dependencies, no allocation, ~14 KB), `src/terrain/wasmLayout.ts` (shared
buffer layout and the parameter subset order), `src/terrain/wasmField.ts`
(row-by-row mirror of `fillGrid`), `src/terrain/wasmField.test.ts`
(differential test over every biome), `src/terrain/chunk.ts` (`buildChunk`
takes the filler), `src/app/terrain.worker.ts` (loads `field.wasm`, switches
when ready, reports which filler built a slab), `scripts/copy-wasm.ts`,
`package.json` (`build:wasm` before build, dev and test), both workflows
(wasm32 target), `docs/adr/…0009…`, `docs/context/performance.md`, README.

**Acceptance.**
- Grids from wasm and TypeScript are byte-identical for seeds 1–2 in every
  mode over seven chunks each (differential test); the render golden and the
  browser checksum gate still pass.
- The worker reports `wasm: true` for slabs built after the module loaded;
  headless runs show it.
- Per-chunk cost drops by 2.2–2.4× (performance note).

**Verification.** Differential test; `pnpm check` green (cargo runs inside
`pnpm test`); headless run in `docs/evidence/2026-09-03-CR-0046/` with
wasm slabs counted.
