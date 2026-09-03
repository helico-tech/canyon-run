---
id: CR-0003
epic: EPIC-02
status: done
---
# CR-0003 Deterministic noise, hashes and PRNG

**Goal.** The numeric primitives every other module builds on, bit-identical across engines.

**Files.** `src/terrain/noise.ts` (`mix`, `fmix32`, `hash1/2/3`, `unit01`, `noise3`, `vnoise1`, `vnoise2`, `fbm1/2/3`, `ridged3`, `smin/smax`, `smoothstep`, `clamp`, `lerp`), `src/sim/hash.ts` (`fnv1a32` over bytes and strings, `hashF64s`), `src/sim/prng.ts` (`splitmix32`, `sfc32` with state in `Uint32Array(4)`, `nextU32`, `nextUnit`), tests beside each.

**Acceptance.**
- `noise3` matches research 03 §3.2 line for line; known-answer vectors for 4 spot values and the 20 000-sample xor checksum `fe04e98a8fd708c1` (the probe's sampling loop is copied into the test) pass.
- FNV-1a vectors: `"" → 811c9dc5`, `"a" → e40c292c`, `"foobar" → bf9cf968`.
- sfc32/splitmix32 known-answer vectors captured once and frozen in the test.
- Lint passes (no banned `Math.*`).

**Verification.** `pnpm check`.
