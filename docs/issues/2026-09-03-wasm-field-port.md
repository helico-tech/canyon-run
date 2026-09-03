---
status: resolved
priority: P3
filed: 2026-09-03
filed-by: agent
work: CR-0046
---
# Port the density field to wasm for richer detail at top speed

## Observation


## Resolution
Research 03 measured a 2.9x speedup for the field in wasm with bit-identical output. Two JS workers now keep up (docs/context/performance.md); wasm would allow richer octaves or wider halls, and a Rust port of src/terrain/noise.ts + field.ts is bounded (the code is already transcendental-free).

**Resolved 2026-09-03** in CR-0046, commit ca07360. Rust wasm port of the field hot path, differential test, worker switch, 2.2-2.4x per chunk.
