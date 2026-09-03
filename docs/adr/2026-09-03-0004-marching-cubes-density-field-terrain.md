---
status: accepted
date: 2026-09-03
deciders: agent (autonomous mandate from the project owner)
---

# 0004: Terrain — one signed density field, hash noise, marching cubes in a worker

## Context

The terrain must be endless, deterministic from a seed, allow overhangs, arches,
caves and pillars, look flat-shaded and colourful without textures, support
several biomes, and be cheap enough for one background worker. It must also
be queryable by the simulation for collision, so the sim and the mesh must
agree bit-for-bit. Research and probes:
`docs/research/2026-09-03-03-terrain-generation.md`.

## Decision

1. **Field.** A single scalar `d(p)`, `d > 0` is rock, `d < 0` is air, iso 0.
   Built as: corridor SDF around a wandering spine (max of wall, floor, ceiling
   half-spaces) → domain warp, ridged multifractal and fBm detail with smooth
   max → SDF booleans for hashed features (`max(d, -f)` adds rock, `min(d, f)`
   carves) → `min(d, coreTube)` guarantees a flyable path → the rock roof is
   the hard ceiling. One field function with a parameter set per biome.
2. **Noise.** Hash-based Perlin-lattice gradient noise (12 edge gradients,
   quintic fade, two-round multiply-xorshift hash) and quintic value noise,
   using only int32 ops and f64 add/mul/div/floor/sqrt/abs. Bit-identical
   results were measured across V8, CPython, Rust native and wasm32.
   Rotations use small tables of literal (cos, sin) pairs. No transcendentals.
3. **Meshing.** Marching cubes over 32³ cells of 2 u (33³ samples, 64 u
   chunks). Bourke tables with the cube-index bit set for air corners so the
   winding faces the viewer. Canonical +axis edge interpolation so shared edges
   produce identical vertices and seams are crack-free. Non-indexed triangles,
   chunk-local f32 positions, per-face u8 RGBA colour, no normal buffer (flat
   shading from screen-space derivatives). Surface nets and dual contouring
   were rejected: faceting is the art style.
4. **Streaming.** One Web Worker owns chunk enumeration and generation. The
   main thread only says which slab (64 u along the flight axis) the plane is
   in; the worker keeps slabs `s-1 … s+10` resident by priority and transfers
   exact-size buffers. Main thread uploads at most 4 chunks per frame. No LOD:
   an exponential fog wall at ~600 u hides the generation horizon.
5. **Collision from the field.** The sim evaluates `d` at a few probe points on
   the plane every tick (sub-stepped along the motion when the tick's travel
   exceeds a cell). Proximity for HUD and scoring is `clamp(-d / 25, 0, 1)`.
   Nothing in the sim reads the mesh.
6. **Biomes.** Even segments are always canyon; odd segments pick a special
   biome by hashing the segment index. Blending lerps amplitudes, widths and
   feature radii over 320 u, never frequencies. Per-face colour is baked in the
   worker from biome ramps, height band, face slope and a hashed jitter.

## Consequences

- Density is ~95 % of chunk cost: ~7–9 ms per candidate chunk in JS, about
  115–160 ms per slab. One JS worker is at 25–50 % of a core at 100–200 u/s.
  If rich detail at top speed needs headroom, the measured options are a
  wasm port of the field (2.9× faster), leaner octaves, or a second worker.
- Every number in the field depends only on `(seed, position)`; chunk order,
  time, and caches never change output. A cross-language test vector file
  guards the noise.
- The marching-cubes table copy is validated by a unit test (edge usage,
  closed meshes, known `edgeTable` prefix).
- The sample grid uses integer-valued doubles, so two chunks sharing a face
  evaluate `d` at bit-identical inputs.
