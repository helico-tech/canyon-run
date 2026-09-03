# CR-0046 evidence — density field in wasm (2026-09-03)

- `bench-js-vs-wasm.txt`: `scratchpad/bench-wasm.ts`, eight chunks per biome,
  three repetitions after warm-up, Node 24: wasm fills a chunk 2.2–2.4× faster
  in every biome (1.9× in the trench, which is mostly base-only samples).
- `headless-chunk-stats.json`: `node tools/headless/run.ts --seed 1 --skip 300
  --frames 120 --every 30` after the loader fix: all 12 slabs built by the
  wasm field (`wasmSlabs` = `slabs`) on two workers.
- `headless-gate.json`: every gate ok, browser checksum equal to Node, and the
  render golden spec passes with wasm-built chunks (the grids are byte-identical,
  so the frame hashes are the same as with the TypeScript field).

The first browser run reported zero wasm slabs: streaming instantiation needs
an `application/wasm` MIME type, which the headless static server did not
send, and the worker fell back silently. The loader now instantiates from
bytes, and the server sends the type anyway.
