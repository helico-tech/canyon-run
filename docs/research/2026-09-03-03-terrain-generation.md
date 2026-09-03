# 03 — Terrain generation design: density field, noise, marching cubes, streaming, biomes

Status: research design, 2026-09-03. Probes live in `../probes/terrain/` (see §12). All numbers marked *measured* come from those probes on this machine (Node 24 / V8, rustc 1.95, x86-64).

## 0. Recommendations in one screen

| Topic | Recommendation |
|---|---|
| Field | Signed, distance-like scalar `d(p)`; **d > 0 rock, d < 0 air**, iso 0. Built as: corridor SDF (max of wall/floor/ceiling half-spaces around a wandering spine) → domain warp + ridged/fBm detail → SDF booleans for features (`max(d,-f)` adds rock, `min(d,f)` carves) → `min(d, coreTube)` guarantees a flyable path → rock roof gives the hard ceiling. |
| Noise | Hash-based 3D gradient noise (Perlin lattice, 12 edge gradients, quintic fade, integer multiply-xorshift hash). 1D/2D quintic value noise for spine and height fields. Only int32 ops + f64 add/mul/div/floor/sqrt/abs. **Bit-identical in V8, CPython, Rust native and wasm32 (measured)**. |
| Mesher | Marching cubes, 32³ cells per chunk (33³ samples), cell 2 u, chunk 64 u. Bourke tables + canonical (+axis) edge interpolation. Non-indexed triangles, flat shading from screen-space derivatives (no normal buffer), per-face u8 colour baked in the worker. |
| Budget | 640 u lookahead ≈ 10 slabs ≈ 80 non-empty chunks ≈ **200 k triangles (measured 199 k)**, 9.6 MB of vertex data (f32 pos + u8 rgba). |
| Cost | Density dominates (95 %). Per candidate chunk: **JS 9.4 ms rich / 6.8 ms lean; wasm ≈ 3.2 / 2.3 ms** (measured JS, wasm ratio measured 2.9×). At 200 u/s one JS worker is at 35–49 % of a core with these settings; wasm at 12–17 %. |
| Streaming | One worker owns generation; main thread sends "plane is in slab s"; worker emits chunk meshes for slabs s−1…s+10 by priority; transfer exact-size ArrayBuffers; main thread uploads ≤ 4 chunks per frame. |
| Collision | Evaluate `d` at ~8 probe points on the plane each fixed step, sphere-trace step `−d/L` for tunnelling; ceiling is real rock plus a hard clamp `y ≤ ceilY(z) − margin`; HUD proximity = `clamp(−d/25, 0, 1)`. |
| Biomes | Canyon (hub) alternating with cave, floating archipelago, crystal spires, lava rift, hoodoo desert (ice fjord optional). One field function with a parameter set per biome; blend along z by lerping amplitudes and feature scales, never frequencies. |

## 1. World frame and conventions

- Units: 1 u ≈ 1 m. Plane speed 100–200 u/s. +Z is the flight axis, +Y up, X lateral.
- Chunk grid: chunk coords `(cx, cy, cz)` integers, origin `o = (cx, cy, cz) · 64`. Sample `(i, j, k) ∈ [0, 32]³` sits at `o + (i, j, k) · 2`. All sample positions are integer-valued doubles → exact → two chunks sharing a face evaluate `d` at bit-identical inputs, so seams are crack-free without any stitching.
- A **slab** is the set of chunks with the same `cz`. The plane consumes 1.6–3.1 slabs/s.
- Sign convention: `d(p) > 0` inside rock. Cube-index bit *i* set when corner *i* is **air** (`d < 0`); with Bourke's `triTable` this makes triangle winding face the air (the viewer). Verified on case 1 in §4.2.
- Everything is a pure function of `(seed, world position)`; features are placed by hashing integer feature cells. No generation-order or time dependence anywhere.

## 2. Density field design

### 2.1 Spine: the corridor centreline (functions of z only)

Evaluated once per z-sample (33 per chunk, 0.013 ms *measured*), then reused for the whole x–y slice.

```
cx(z)     = A1·fbm1(z/λ1, s1, 2 oct) + A2·vnoise1(z/λ2, s2)         lateral wander
floorY(z) = Af·fbm1(z/λf, s3, 2 oct)                                  altitude wander
ceilY(z)  = floorY(z) + H                                             hard ceiling height
coreY(z)  = floorY(z) + 0.45·H                                        guaranteed-tube centre
hw(z)     = W·(1 + 0.35·vnoise1(z/λw, s4))                            half width
```

`vnoise1` is quintic-interpolated value noise (C², so curvature is continuous — the plane never sees a kink). Curvature bound for one term `A·n(z/λ)`: `|n''| ≤ 2·5.77` (max of the quintic fade's second derivative times the lattice-value range) so

```
κ_max ≈ 11.5 · A / λ²        (per term; add terms; halve λ and amplitude for a 2nd fBm octave → κ doubles)
required lateral acceleration at speed v:  a = v² · κ_max     must be ≤ ~0.6 · a_plane
max lateral slope  = 3.75 · A / λ            → lateral speed needed = slope · v
```

| Term | A | λ | κ contribution | R = 1/κ |
|---|---|---|---|---|
| lateral, low freq (2 oct fBm) | 80 | 800 | 0.0023 | 435 u |
| lateral, mid freq | 12 | 260 | 0.0020 | 500 u |
| **sum** | | | **0.0043** | **230 u** |
| floor, 2 oct fBm | 30 | 520 | 0.0021 | 480 u |

At 200 u/s this needs 172 u/s² lateral and a lateral speed of 0.55·v = 110 u/s; at 150 u/s it needs 97 u/s². Tune `A`/`λ` against the plane's real turn authority (the probe used A2 = 20, λ2 = 180, which is tighter: R ≈ 110 u).

### 2.2 Canyon base: intersection of three noisy half-spaces

```
dx      = x − cx(z)
h       = (y − floorY(z)) / H                          0 at floor, 1 at ceiling
profile = 1 + 0.3·S(0,1,h) − 0.6·S(0.7,1,h)            S = smoothstep; walls lean out, then curl in → overhang lip
sdWall  = |dx| − hw(z)·profile(h)
sdFloor = floorY(z) − y
sdCeil  = y − ceilY(z)
base    = max(sdWall, sdFloor, sdCeil)                  air = all three negative; rock = any positive
```

`base` is cheap (≈ 15 ns/sample *measured*) and ~1.5-Lipschitz; it drives the shell skip (§2.7) and the chunk pre-test. Because `hw` depends on `y` through `profile`, walls are already non-monotonic in y (overhangs) before any noise — marching cubes needs no special handling for this.

### 2.3 Detail on top of the base

```
warp   : p' = p + Wamp · (fbm3(p/λW, s11), fbm3(p/λW + o, s12), 0)      1–2 octaves; warp x,y only
ridges : sdWall  += Ar · (2·ridged3(x'/λr, y'/(λr/0.35), z/λr, s13, 2–3 oct) − 1)   y stretched → vertical flutes
floor  : sdFloor += Af · fbm2(x'/λf, z/λf, s14, 2 oct)                    2D value fBm (4 hashes/octave)
ceiling: sdCeil  += Ac · fbm2(x'/λc, z/λc, s15, 2 oct)
combine: d = smax(smax(sdWall, sdFloor, k), sdCeil, k)                      rounded creases, k = 8
detail : d += Ad · noise3(p/λd, s16)                                        breaks up flat facets
```

Smooth min/max (Quilez polynomial, pure mul/add/abs):

```
smin(a,b,k) = min(a,b) − h·h·k·0.25,   h = max(k − |a − b|, 0) / k
smax(a,b,k) = −smin(−a, −b, k)
```

Ridged multifractal (Musgrave): per octave `n = 1 − |noise|; n = n²·w; w = min(n, 1)`; sum with amplitude `gain^i`, normalise. Range [0, 1]; crests are sharp → strata and flutes.

### 2.4 Features via SDF booleans and hashed placement

Add rock: `d = max(d, −sdFeature)`. Carve air: `d = min(d, sdFeature)`. All features are placed on integer *feature cells* (`floor(x/C), floor(z/C)` or 3D) and their parameters come from `hash2/hash3(cell, seed ^ tag)`, so any evaluator anywhere reconstructs the same feature.

| Feature | Shape (SDF) | Placement | Params from hash |
|---|---|---|---|
| Pillar / column | vertical capsule: `len(x−px, z−pz) − r·(1 + 0.25·noise3(px/20, y/12, pz/20))` | 2D cells C = 56 u, p = 0.35, jitter 0.2–0.8 of cell | px, pz, r ∈ [0.7,1.3]·5 |
| Boulder | sphere `len(p − c) − r·(1 + 0.2·noise3)`, c.y = floorY + floor noise + 0.4·r (buried) | 2D cells C = 20 u, p = 0.25 | c, r ∈ [2, 6] |
| Arch | torus with axis along z: `len(len(q.xy) − R, q.z) − r`, centre `(cx(z0), floorY(z0) + 0.25H, z0)`, R = 1.1·hw(z0) — lower half buried in walls/floor | z cells C = 256 u, p = 0.3, one per cell | z0, r ∈ [5, 9] |
| Side tunnel / dead end | capsule along a hashed direction from the wall: `len(p − seg(p)) − r` (carve) | z cells C = 200 u, p = 0.4 | side, length 60–120, r 8–12, dir from a 16-entry direction table |
| Stalactite / stalagmite | anisotropic spikes: `sdCeil += As·spike(x', z')`, `spike = s³` of `ridged` sampled at (x/8, z/8) | continuous | As per biome |
| Floating rock | ellipsoid `len(q/(r·e)) · min(e) − 1`-style bound, plus ridged surface | 3D cells C = 48 u, inside corridor volume, p = 0.5 | c, r 6–18, e per axis |
| Crystal | hex prism `max(|q.y| − hh, max(|q.x|·0.866 + |q.z|·0.5, |q.z|) − r)` tilted by a hashed entry of a 16-entry precomputed (cos, sin) table | 2D cells C = 24 u on floor + walls | tilt index, r 2–5, hh 8–30 |
| Hoodoo | capsule whose radius steps with height: `r(y) = r0·(1 + 0.3·sq(y/6))`, sq = square wave via `floor` parity | 2D cells C = 40 u, p = 0.5 | r0 4–8, height 30–80 |

**Per-chunk gather.** Before sampling a chunk, list the features whose reach can touch it: iterate feature cells overlapping the chunk AABB padded by `reach = r_max + 8`. Per sample, loop that list with an AABB early-out. This turned 9 hash lookups + noise per sample into ~0–3 cheap tests and cut the wall-chunk cost by 40 % *(measured, §4.4)*. Correctness: a feature outside the pad cannot make any sample rock (`sd ≥ pad > 0`) and cannot change the value at any sample within one cell of the surface (|d| there is < 8), so the mesh equals the one produced by a global gather; only deep-air magnitudes differ, which the mesher never reads.

Any rotation uses a small constant table of `(cos θ, sin θ)` literals; no `Math.sin` in the hot path.

### 2.5 Guaranteed corridor and hard ceiling

```
sdCore = len(x − cx(z), y − coreY(z)) − Rcore           Rcore = 12 (≥ 2× plane radius)
d = min(d, sdCore)                                       always air along the spine, in every biome and blend
```

Features may intrude anywhere else; the tube guarantees the level is completable. The **hard ceiling** is real rock (`sdCeil`) so the plane collides with geometry, never an invisible wall. Two complementary safety nets: a clamp `y ≤ ceilY(z) − 3` in the flight controller, and the density collision itself (§6). In open-feeling biomes the roof is hidden by altitude fog (§7) rather than removed.

### 2.6 Parameter table, canyon biome (probe values)

| Symbol | Meaning | Value |
|---|---|---|
| W | half width | 40 u (canyon 60–110 u wide) |
| H | floor→ceiling | 110 u |
| Rcore | guaranteed tube radius | 12 u |
| A1/λ1, A2/λ2 | lateral wander | 80/800 (2 oct), 12/260 |
| Af/λf | floor altitude wander | 30/520 (2 oct) |
| λw | width variation | 230 |
| Wamp/λW | domain warp | 10 u / 45 u, 1–2 oct |
| Ar/λr | wall ridges | 7 u / 28 u, 2–3 oct, y stretched ×0.35 |
| Af, Ac | floor / ceiling noise | 5 u, 4 u at λ 33 / 25 |
| Ad/λd | fine detail | 1.5 u / 7 u |
| k | smax radius | 8 |
| pillars | spacing / prob / radius | 56 u / 0.35 / 5 u |
| L | Lipschitz bound of the full field (approx.) | 3–4 |

### 2.7 Amplitude bound and the shell skip

Everything added to `base` is bounded: `B = 1.5·Wamp + Ar + Af + Ac + Ad + k/4 ≈ 31 u`. In `fillGrid`:

```
b = base(p)
if b >  B + cellDiag       → d = b                      (deep rock, no noise needed)
if b < −B − cellDiag       → d = max(b, −pillars(p))    (deep air; only features can add rock)
else                       → d = full(p)                (the shell)
```

*Measured* on a wall chunk: 34 % of samples skipped, 36 % less time. Chunks whose whole 33³ base grid lies outside the bound cost only the base pass (~0.5 ms) — that is how the 9 "candidate but empty" chunks per slab stay cheap. A first-level filter (corridor AABB per slab padded by B + 8) rejects most of a slab's chunks without sampling: 48 → 16.8 candidates per slab *(measured)*.

## 3. Noise

### 3.1 Choice

| Candidate | Cost (3D) | Isotropy | Port risk | Verdict |
|---|---|---|---|---|
| Perlin-style gradient, integer hash | 8 hashes, 8 dots, 7 lerps; **48 ns JS / 20 ns native** *(measured)* | mild axis bias, invisible after warp + fBm | lowest: only imul/xor/shift + f64 mul/add | **use** |
| OpenSimplex2 / simplex | 4 corners but skew, contribution kernels, larger gradient tables | best | more branches, constants; two implementations must match exactly in every branch | not needed |
| Value noise | 8 hashes, 7 lerps; ~5 ns for 1D | blobby | trivial | **use** for spine (1D) and height fields (2D) |
| Permutation table (classic Perlin) | cheapest lookups | same as above | periodic (256 lattice cells) and a shared table to keep in sync | no |

### 3.2 Reference implementation (TypeScript; Rust port is line-for-line)

```ts
// int32 lattice hash; Rust: u32 wrapping_mul / ^ / >>.
function mix(h: number): number {                       // two multiply-xorshift rounds; only top 4 bits are used
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}
const GRAD = new Float64Array([1,1,0, -1,1,0, 1,-1,0, -1,-1,0, 1,0,1, -1,0,1, 1,0,-1, -1,0,-1,
                               0,1,1, 0,-1,1, 0,1,-1, 0,-1,-1, 1,1,0, 0,-1,1, -1,1,0, 0,-1,-1]);
function grad3(h: number, x: number, y: number, z: number): number {
  const i = (h >>> 28) * 3; return GRAD[i] * x + GRAD[i + 1] * y + GRAD[i + 2] * z;
}
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);       // quintic, C2
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function noise3(x: number, y: number, z: number, seed: number): number {   // ≈ [-0.92, 0.92]
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  const ix = fx | 0, iy = fy | 0, iz = fz | 0;
  x -= fx; y -= fy; z -= fz;
  const u = fade(x), v = fade(y), w = fade(z);
  const hx0 = Math.imul(ix, 0x8da6b343) ^ seed, hx1 = Math.imul(ix + 1, 0x8da6b343) ^ seed;
  const hy0 = Math.imul(iy, 0xd8163841),        hy1 = Math.imul(iy + 1, 0xd8163841);
  const hz0 = Math.imul(iz, 0xcb1ab31f),        hz1 = Math.imul(iz + 1, 0xcb1ab31f);
  const n000 = grad3(mix(hx0 ^ hy0 ^ hz0), x, y, z),         n100 = grad3(mix(hx1 ^ hy0 ^ hz0), x - 1, y, z);
  const n010 = grad3(mix(hx0 ^ hy1 ^ hz0), x, y - 1, z),     n110 = grad3(mix(hx1 ^ hy1 ^ hz0), x - 1, y - 1, z);
  const n001 = grad3(mix(hx0 ^ hy0 ^ hz1), x, y, z - 1),     n101 = grad3(mix(hx1 ^ hy0 ^ hz1), x - 1, y, z - 1);
  const n011 = grad3(mix(hx0 ^ hy1 ^ hz1), x, y - 1, z - 1), n111 = grad3(mix(hx1 ^ hy1 ^ hz1), x - 1, y - 1, z - 1);
  const x00 = lerp(n000, n100, u), x10 = lerp(n010, n110, u), x01 = lerp(n001, n101, u), x11 = lerp(n011, n111, u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}

// Feature placement / value noise use a stronger mix (murmur3 fmix32) because all 32 bits are consumed.
function fmix32(h: number): number { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; }
export const hash1 = (ix: number, seed: number) => fmix32((Math.imul(ix, 0x8da6b343) ^ seed) | 0);
export const hash2 = (ix: number, iy: number, seed: number) => fmix32((Math.imul(ix, 0x8da6b343) ^ Math.imul(iy, 0xd8163841) ^ seed) | 0);
export const unit01 = (h: number) => (h >>> 8) * (1 / 16777216);        // exact in f64, identical everywhere

export function vnoise1(x: number, seed: number): number {               // [-1, 1], C2
  const fx = Math.floor(x), ix = fx | 0, t = fade(x - fx);
  return lerp(unit01(hash1(ix, seed)) * 2 - 1, unit01(hash1(ix + 1, seed)) * 2 - 1, t);
}
const seedOctave = (seed: number, i: number) => (seed + Math.imul(0x9e3779b9 | 0, i + 1)) | 0;
export function fbm3(x: number, y: number, z: number, seed: number, oct: number, lac = 2, gain = 0.5): number {
  let amp = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) { sum += amp * noise3(x, y, z, seedOctave(seed, i)); norm += amp; x *= lac; y *= lac; z *= lac; amp *= gain; }
  return sum / norm;
}
export function ridged3(x: number, y: number, z: number, seed: number, oct: number, lac = 2, gain = 0.5): number {
  let amp = 1, sum = 0, norm = 0, w = 1;
  for (let i = 0; i < oct; i++) {
    let n = 1 - Math.abs(noise3(x, y, z, seedOctave(seed, i))); n = n * n * w; w = n > 1 ? 1 : n;
    sum += n * amp; norm += amp; x *= lac; y *= lac; z *= lac; amp *= gain;
  }
  return sum / norm;
}
```

Rust mapping: `Math.imul(a,b)` → `(a as u32).wrapping_mul(b)`; `x | 0` after `floor` → `as i32` (equal for |x| < 2³¹); `>>> n` → `u32 >> n`; `Math.floor/abs/sqrt/min/max` → `f64::floor/abs/sqrt/min/max` (never feed NaN; see §3.3). The full port is `noise.rs`; `noise_wasm.rs` is the same compiled to `wasm32-unknown-unknown`.

### 3.3 Float reproducibility rules

Deterministic across engines (IEEE 754 requires correct rounding): `+ − × ÷ sqrt`, comparisons, `floor/ceil/trunc/abs/fround`, integer ops. Both V8 and rustc/LLVM keep source evaluation order and never contract `a*b + c` into an FMA (Rust: only `mul_add` does; wasm: only the relaxed-SIMD proposal does — do not enable it). Everything else is a hazard:

1. **No transcendental functions in the field**: `sin, cos, tan, exp, log, pow, cbrt, hypot, atan2` are "implementation-approximated" in ECMAScript and libm-dependent in Rust. Use polynomials, tables of literal constants, `x*x*x` instead of `pow(x,3)`.
2. **f64 everywhere in the field**, in both languages. Rounding to f32 only when writing vertex buffers (`Float32Array` store and Rust `as f32` both round-to-nearest-even). Never compute in f32 on one side and f64 on the other.
3. **No NaN, no ±0 dependence.** `Math.max(NaN, x)` is NaN while Rust's `max` returns `x`; `Math.min(0, -0)` is `-0`, Rust may return either. Guard divisions (`d0 / (d0 − d1)` is only evaluated when the signs differ).
4. **No `Math.round`** (JS rounds .5 toward +∞, Rust away from zero); use `floor(x + 0.5)`.
5. **Integer casts**: `x | 0` is modular, Rust `as i32` saturates; keep lattice coordinates well inside int32 (they are: z/λ < 10⁶ after a day of flight).
6. **Hashes on integers only**; convert hash → float only through `unit01` (top 24 bits × 2⁻²⁴, exact).
7. **Same summation order** for fBm/ridged (octave loop written identically). Do not let a compiler reassociate: no `-ffast-math`, and for any C++ port `-ffp-contract=off` (GCC contracts by default).
8. **wasm**: f64 ops are deterministic; NaN payloads are not (irrelevant, we never produce NaN). SIMD `f64x2` standard ops are fine; relaxed ops are not.
9. Colour math also stays in this subset (§7) so replays and screenshots match, but only the field needs it for gameplay.

### 3.4 Measurements (noise)

| Implementation | noise3 ns/eval | Notes |
|---|---|---|
| V8, murmur fmix32 per corner, branchy gradient | 92–100 | first version |
| V8, fmix32 + gradient table | 80–91 | |
| **V8, 2-round mix + table (reference)** | **48–57** | gradient histogram flat (1.00 ± 0.02 over 16 buckets) |
| Rust native `-O` | **19.9** | same bits |
| vnoise1 (V8) | 5.5 | |
| fbm3 4 octaves (V8) | 276 | |

Bit-identity: 4 spot values and an xor-checksum of the f64 bit patterns over 20 000 samples of `fbm3 + ridged3 + vnoise1` are identical in **V8 (Node 24), CPython 3.12, Rust native and Rust→wasm32 run inside V8**: `xor = fe04e98a8fd708c1`, `sum = 11897.05833454898`.

## 4. Marching cubes

### 4.1 Chunk sizing

| Choice | Value | Why |
|---|---|---|
| cells per chunk | 32³ (33³ = 35 937 samples) | one sample slab shares faces with neighbours (9 % duplicated samples, pays for crack-free seams) |
| cell size | 2 u | 30–55 cells across the canyon: chunky low-poly look, plane (≈ 6 u) still reads against 2-u facets |
| chunk | 64 u | 1.6–3.1 slabs/s at flight speed |
| far alternative | 2.5–3 u cells | density cost ∝ 1/cell³ (×0.51 at 2.5 u), triangles ∝ 1/cell² (×0.64) |

### 4.2 Tables, bit convention, canonical interpolation

- Use Paul Bourke's public-domain `edgeTable[256]` and `triTable[256][16]` (paulbourke.net/geometry/polygonise/, also in three.js `MarchingCubes.js` and the Rust `isosurface`/`mcubes` crates). Corner order: 0 (0,0,0), 1 (1,0,0), 2 (1,1,0), 3 (0,1,0), 4–7 the same at z+1. Edges 0–3 ring z=0, 4–7 ring z=1, 8–11 vertical.
- Bourke sets bit *i* when `val[i] < iso`. With rock = `d > 0` and iso 0 that means **bit set for air corners**, and his winding then faces the air: case 1 (`{0, 8, 3}`) has normal `(e8−e0)×(e3−e0) = (−¼,−¼,−¼)`, i.e. toward corner 0, the air corner. Front faces are visible from inside the canyon; no flipping needed.
- **Canonical edge interpolation**: always interpolate from the lower to the higher coordinate along the edge axis (`x = x0 + s·cell`, `s = d_lo / (d_lo − d_hi)`), never from "corner p1 to p2" of Bourke's edge list (his edges 2, 3, 6, 7 run backwards). Otherwise the two cubes sharing an edge can differ by an ulp and the f32 vertex can round differently → hairline cracks and lost bit-identity. Cleanest: compute each sample's three outgoing edge vertices (+x, +y, +z) once into an edge cache (3 × 33³ entries), then cells fetch by index — each vertex computed once instead of up to four times.
- Chunk-local positions (0…64) in the vertex buffer; the chunk's world translation goes in the model matrix. Keeps f32 precision after hours of flight (z ≈ 10⁶ u would otherwise jitter by 6 cm on the GPU); three.js multiplies view × model on the CPU in f64.
- **Validate the table copy with a unit test** (both languages, same test vectors): for every case (a) every triangle edge is a crossing edge and every crossing edge is used, (b) each directed triangle edge is either a face segment used exactly once or an interior diagonal used exactly twice in opposite directions, (c) `edgeTable[0..15] = 0x000,0x109,0x203,0x30a,0x406,0x50f,0x605,0x70c,0x80c,0x905,0xa0f,0xb06,0xc0a,0xd03,0xe09,0xf00`. The probe implements this and additionally meshes a random 32³ grid and checks the output is closed: **105 133 triangles, 0 open interior edges**.
- Alternative to copying 4 096 numbers: generate the tables at start-up from the rule "on each face join crossing edges into segments (ambiguous faces: keep solid corners separated); walk segments into loops; fan-triangulate; orient by the face-segment rule". The probe does this (`buildTables`), 820 triangles over 256 cases, max 5 per case, and it matches Bourke's edge table. Fan triangulation can put a diagonal on a cube face in a few ambiguous cases, where the neighbour's sheet touches it along a line (14 such edges in the random-grid test, none in terrain-like fields so far). Harmless for rendering; a centroid fan would remove it at +1 triangle per loop.

### 4.3 Flat shading and vertex layout

- Non-indexed triangles, 3 vertices each. Per-face colour is written to all 3 vertices, so the interpolated varying is constant — no provoking-vertex tricks. Indexed MC vertices are shared by ~6 faces, so a "flat" varying would need duplicates anyway.
- **No normal buffer**: with WebGL2 `flatShading` the fragment shader derives the face normal from `dFdx/dFdy` of the view position (three.js `flatShading: true` does exactly this). Saves 12 B/vertex and any normal encoding decisions.
- Layout per vertex: `position f32×3` (12 B) + `rgba u8×4` (4 B, alpha byte = material/AO) = **16 B → 48 B/triangle**. 200 k triangles = 9.6 MB. Compact option if ever needed: `u16×3` chunk-local positions (1/256 u steps) + `u8×4` = 10 B/vertex.
- Budget: MC yields ~2.8 triangles per surface cell. Canyon perimeter ≈ 2H + 4W ≈ 380 u ≈ 190 cells × 32 cells deep × 2.8 ≈ 17 k per slab; *measured 19.9 k*. Cave biomes with side tunnels can reach 1.5–2× that; keep the per-chunk output cap at 12 k triangles (max seen: 5.1 k).

### 4.4 Cost (measured, 33³ samples, canyon biome)

| Stage | JS (V8) | Notes |
|---|---|---|
| spine × 33 | 0.013 ms | |
| base field × 33³ | 0.2–0.7 ms | 6–20 ns/sample |
| full density, wall chunk, rich (warp 2 oct, ridge 3, floor 2) | 22.0 ms full / **14.0 ms with shell skip** | 23 640 of 35 937 samples full |
| full density, wall chunk, lean (warp 1, ridge 2, floor 2) | 15.1 / **10.3 ms** | |
| marching cubes + colour, 1.7 k tris | **0.4–1.2 ms** | density is 95 % of the chunk |
| 8-noise per-sample workload (density proxy) | JS 504–539 ns/sample = 18 ms per 33³; **wasm 172–194 ns = 6.2 ms per 33³** | wasm/JS = 2.9×, bit-identical results |
| slab census, 10 slabs, rich | 9.4 ms per candidate chunk, **158 ms per slab** | 16.8 candidates → 7.9 non-empty per slab |
| slab census, lean | 6.8 ms per candidate, **114 ms per slab** | |

Wasm/Rust estimates from the 2.9× ratio: ≈ 55 ms per slab rich, 40 ms lean. Native Rust ≈ 2.4× faster than V8 on noise alone (and 4–5× with autovectorised inner loops, not measured).

### 4.5 Alternatives, briefly

- **Naive surface nets**: one vertex per surface cell at the centroid of edge crossings, quads between neighbours. Similar triangle count, smoother, no ambiguous cases, but rounds off sharp features and needs indexed quads that look diamond-shaped when split under flat shading. No advantage for this style.
- **Dual contouring**: Hermite data (gradient at each crossing = 3–6 extra density samples) + a QEF solve per cell; reproduces sharp edges. Doubles the density cost, adds numerical code that is harder to make bit-identical, and can emit non-manifold output. The sharpness it buys is exactly what 2-u flat-shaded MC facets already give visually.
- **Marching cubes** is table-driven, trivially portable, watertight with the canonical interpolation, and its faceting *is* the art style. Verdict: MC.

### 4.6 LOD ring or fog wall

Fog wall. Reasons: the corridor winds (R ≈ 230–500 u), so most geometry beyond ~500 u is occluded anyway; 200 k flat triangles are trivial for the GPU; LOD seams (cracks between 2-u and 4-u chunks) need skirts or Transvoxel, which is real complexity. Use exp² fog with `density = 1.98 / D_far` (`D_far` = 600 u → 98 % fogged) plus the sky-coloured clear colour, and generate to 640 u. Revisit a half-resolution far ring (16³ per chunk, skirts) only if a biome opens up enough that the fog wall becomes visible.

## 5. Streaming architecture

### 5.1 Ring of slabs

```
s = floor(z_plane / 64)
resident:  slabs s−1 … s+10        (≈ 12 × 8 non-empty ≈ 96 chunks, ≈ 200 k tris, ≈ 9.6 MB)
generate:  slab s+11 as soon as slab s−1 is evicted; keep ≥ 2 slabs of margin between "generated" and "visible"
evict:     slab < s−1  (dispose GPU buffers; keep one behind for rear camera/replay)
```

Per slab the worker enumerates chunks in a fixed x/y range around the spine (48), rejects by corridor AABB (→ 17), samples the base grid and rejects empties (→ 8), meshes the rest. Enumeration lives in the worker, so the main thread only ever says "plane is in slab s".

### 5.2 Worker protocol

```
main → worker : { type: 'seed', seed }                          once
main → worker : { type: 'slab', s }                             on slab change (and a 'flush' when the seed changes)
worker → main : { type: 'chunk', cx, cy, cz, tris, pos: ArrayBuffer, rgba: ArrayBuffer, aabb }   transfer list = [pos, rgba]
worker → main : { type: 'slabDone', s, chunkCount, ms }         for the HUD/debug overlay
```

- The worker keeps a priority queue keyed by `(slab distance ahead, distance from spine)` and a set of finished chunk keys; a new `slab` message re-prioritises and drops queued work behind the plane.
- Output buffers: allocate exact-size `Float32Array(tris·9)` / `Uint8Array(tris·12)` per chunk and transfer them (zero-copy). ~20 chunks/s × 150 KB = 3 MB/s of allocation; GC handles that. Only if profiling shows GC hitches, switch to a ping-pong pool (main thread returns buffers after upload).
- Density/edge-cache scratch (`Float64Array(33³)`, edge cache, MC output scratch of 12 k tris) are allocated once in the worker and reused.
- Rust/wasm variant: the same worker hosts the wasm module; `fillGrid + march` run in wasm memory, the JS side copies the used range out into transferable buffers (memcpy of ~150 KB). Native (Rust client) uses one generation thread and a channel; identical protocol.

### 5.3 Budgets and chunks in flight

| Speed | slabs/s | candidate chunks/s | JS rich (9.4 ms) | JS lean (6.8 ms) | wasm rich (≈3.2 ms) |
|---|---|---|---|---|---|
| 100 u/s | 1.6 | 27 | 250 ms/s (25 %) | 180 ms/s | 87 ms/s (9 %) |
| 150 u/s | 2.3 | 39 | 370 ms/s | 270 ms/s | 125 ms/s |
| 200 u/s | 3.1 | 52 | 490 ms/s (49 %) | 355 ms/s (36 %) | 170 ms/s (17 %) |

- A slab takes 114–158 ms in JS, during which the plane moves 23–32 u, so a 2-slab margin (128 u) is comfortable; effectively 1 slab (≈ 8–17 chunks) is in flight at a time. Two workers (even/odd slabs) double throughput if JS-only and rich is wanted at 200 u/s; otherwise wasm or 2.5-u cells (×0.51) give the headroom.
- Main thread: ≤ 4 chunk uploads per frame (each: create geometry, `bufferData` ~150 KB, ~0.3 ms). Never block on the worker; if the visible edge reaches an ungenerated slab, show the fog wall — it must not happen with the margin above.
- Start-up: 12 slabs ≈ 200 candidates ≈ 1.9 s JS rich / 0.65 s wasm. Generate 4 slabs before the plane is released, the rest during the launch animation.
- Memory: ~10 MB GPU + ~10 MB CPU copies (three.js retains the arrays; set `attribute.array = null`-style release or accept it), plus < 2 MB worker scratch.

## 6. Collision from the field

- **Probe points** on the plane (fixed timestep, 120 Hz recommended): centre, nose, tail, left/right wing tips, top, bottom, two mid-wing points — 9 evaluations of the full `d` (≈ 1 µs each in JS with a 9-cell feature gather around the plane). Hit when any `d(probe) > −r_probe` (r ≈ 0.3–0.5 u tolerance for the mesh-vs-isosurface error, which is < 0.3 u at 2-u cells).
- **Tunnelling**: at 200 u/s and 120 Hz the plane moves 1.7 u per step, less than the 2-u cell, so probe-per-step is already safe. For extra speed or lower rates, sphere-trace along the step: while `t < step`, `t += max(−d(p + t·dir)/L, 0.25)`; with `L ≈ 4` this is 1–2 evaluations per step in open air.
- **Ceiling**: the roof is rock, so collision is natural; add the controller clamp `y ≤ ceilY(z) − 3` (`spine(z)` is 0.4 µs) as a second net, and a soft push-down force in the top 10 u to avoid a jarring stop.
- **HUD proximity**: `prox = clamp(−d(p_centre) / 25, 0, 1)` (1 = touching) — `d` is distance-like in the air so this reads as metres to rock; smooth it with a 100 ms filter. A **look-ahead warning** samples `d` at `p + v·0.4 s` and at the predicted position along the current turn; beep when it goes positive. Both use the same pure function, so the HUD is deterministic too.
- Because collision never touches the mesh, replays and cross-platform ghosts are exact given a fixed timestep and deterministic controller integration (also mul/add only).

## 7. Colour and fog

Per-face colour is baked in the worker from `(biome blend t, height h, slope n.y, band noise, hash jitter)`; no textures, no lighting baked.

```
material = n.y > 0.6 ? FLOOR : n.y < −0.35 ? CEILING : WALL              (per-face normal from the cross product)
h        = clamp((y − floorY(z)) / H, 0, 1)
band     = frac(h·nBands + 0.4·noise3(p/50))                               strata; nBands 6–9
rgb      = ramp[biome][material](material == WALL ? band : h)              ramps: 3–6 u8 stops, linear lerp
rgb     *= 0.9 + 0.2·unit01(hash3(cell, tri, seed))                        ±10 % per-face value jitter
cavity   = base(p + 4·n) > −2 ? 0.7 : 1                                     optional: darken faces looking into rock
edge     = smoothstep(−0.35, 0.6, n.y) mixes wall→floor ramps softly near the crease
```

- Ramps per biome (sRGB u8; blend across biomes with the same `t` as the field). Vivid, flat, high-contrast between floor/wall/ceiling so the silhouette reads at speed:

| Biome | Wall ramp | Floor | Ceiling | Fog / sky | Key light |
|---|---|---|---|---|---|
| Canyon | #C4543A → #E48440 → #F2B25C → #A03C46 | #D6B060 → #E8CA78 | #5C283C → #8C3C50 | #F4B58C (warm haze) | warm white, 35° elevation |
| Cave | #1E2A44 → #2E4A6A, cyan band #27C4C8 every 5th | #24303A | #12172A with #3A2A5C spikes | #060A14 dense | cool blue, low |
| Archipelago | #7A5AA6 → #B784D2 → #F0A8C8 | #3C8C8C haze floor | hidden by fog | #C8E8F0 | pastel pink-white |
| Crystal spires | #2A1E3C → #40305C (rock); crystal faces #33F0FF / #FF40D8 / #B4FF3C by hash | #1E1830 | #16102A | #2A1040 | magenta rim |
| Lava rift | #202020 → #3A3232 with #FF6A1E band when band > 0.9 | #FF7A2A → #FFC24A (lava) | #2A1A1A | #4A1C0E | orange from below (hemisphere ground) |
| Hoodoo desert | #E88A4A → #F2B27A → #FFE0B0 | #E8C890 | hidden by fog | #F6D9A8 | warm noon |
| Ice fjord (opt.) | #CFE8FF → #8CC0F0 → #4A80C8 | #E8F4FF (frozen lake) | #B0D8FF | #DCEFFF bright | cold white |

- **Fog**: `fogColor = lerp(biomeA.fog, biomeB.fog, t(z_plane))`, exp² density from §4.6 plus **altitude fog** in open biomes: extra density `k_alt·smoothstep(0.5, 1, h)` so the rock roof fades into sky colour and reads as "open above" while still stopping the plane. Clear colour = fog colour. Hemisphere light: sky = fog colour, ground = floor ramp mid-stop. No shadows.

## 8. Biomes and blending along the flight axis

### 8.1 Sequencing

Even segments are always **canyon** (the hub, 1 200 u); odd segments pick a special biome by `hash1(k, seed)` (2 000–3 000 u each). This avoids two special biomes back to back without any recursive "previous biome" lookup, and gives a natural rhythm: canyon → special → canyon → special. Blend zone `Lb = 320 u` (5 slabs) centred on each boundary; `t(z) = smoothstep(z0 − Lb/2, z0 + Lb/2, z)`. A slowly rising `difficulty(z)` (narrower `W`, more features) is applied in the same parameter step.

### 8.2 One field, many parameter sets

`d(p) = field(p, params(z))` where `params(z) = mixParams(biomeA, biomeB, t)`. Rules:

- **Lerp amplitudes, widths, heights, feature probabilities and radii.** `hw`, `H`, `Rcore`, `Ar`, `Af`, `Wamp`, feature radii `r·t` (features shrink to zero rather than pop).
- **Never lerp a frequency** (the noise would slide). If two biomes use different frequencies for the same role, keep both terms with amplitudes `(1−t)·A_a` and `t·A_b`, and skip any term whose amplitude is 0 — so the double cost is paid only inside the blend zone (≈ 12 % of flight length).
- The core tube is present in every biome, so a blend can never close the corridor; feature lists are gathered with both biomes' cell sizes inside the blend zone.
- Structural switches (roof present or not, floor type) are expressed as amplitudes too: e.g. the cave's tube cross-section is `sdTube = len(dx/hw, (y−coreY)/hh) − 1` blended with the canyon slot via `smax` weights `(1−t, t)`.

### 8.3 Biome definitions

| Biome | Corridor | Density modifiers | Features (§2.4) | Feel |
|---|---|---|---|---|
| **Canyon** (hub) | slot, W 40, H 110, overhang profile | warp 10, ridges 7 @ 28 (vertical flutes), floor fBm 5, ceiling 4, detail 1.5 | pillars 0.35, boulders 0.25, arch 0.3/256 u | fast, sweeping, orange strata |
| **Cave / tunnel system** | elliptic tube, W 28, H 55, no profile; base = `len(dx/hw, dy/hh) − 1` scaled to distance | warp 6, ridges 5 @ 18 with y-stretch 1 (bulbous), stalactites As 9, stalagmites 6 on floor | columns 0.5 @ 40 u, side tunnels 0.4/200 u (carve, dead ends), boulders 0.3 | claustrophobic, dark, neon bands, low ceiling → speed feel |
| **Floating archipelago** | tall hall, W 80, H 170, floor far below (floorY − 40), roof in fog | warp 14 @ 60, ridges 4, floor fBm 8 | floating rocks 3D cells 48 u p 0.5 r 6–18 (ridged surface), hanging chains (thin vertical capsules), arches between rocks 0.3 | slalom between islands, pastel |
| **Crystal spires** | canyon slot W 36, H 120, profile lip 0.3 | warp 8, ridges 3 (walls smoother, basalt), detail 1 | crystals 2D cells 24 u on floor (p 0.6) and walls (p 0.3), some spanning (length up to 0.8·2W, p 0.1 per 128 u) | sharp faceted neon prisms on dark rock, near-misses |
| **Lava rift** | deep narrow slot, W 30, H 140, profile 1 + 0.1h (near-vertical) | warp 5, ridges 9 @ 40 with y-stretch 0.1 (horizontal strata), detail 2 | floor = lava plane (flat, `sdFloor = floorY − y` with noise 0.5; colour emissive), rock islands (boulders r 4–10 p 0.3), bridges (arch r 4, p 0.5/200 u) | vertical, dangerous floor, glowing seams |
| **Hoodoo desert** | wide low hall, W 90, H 100, walls recede (profile 1 + 0.6h), roof in warm fog | warp 12 @ 70, ridges 4 @ 35 y-stretch 0.15 (banded), floor fBm 3 | hoodoos 2D cells 40 u p 0.5, mesas (rounded boxes 20–40 u, p 0.15 @ 96 u), boulders 0.2 | open, obstacle field, creamy oranges |
| Ice fjord (optional) | tall slab walls, W 55, H 150 | ridges 12 @ 60 low-frequency (smooth slabs), detail 0.8, floor = flat lake (noise 0.3) | icebergs (rounded boxes 8–25 u p 0.4 @ 60 u), ice arches 0.3 | glassy, bright, wide turns |

Blend examples: canyon → cave lerps `hw 40→28`, `H 110→55`, switches the cross-section via `smax` weights, fades pillars' radius to 0 while columns' radius fades in, and raises `As` (stalactites) from 0 to 9; fog colour warm haze → near black; light warm → cool.

## 9. Determinism checklist

1. `d(p)` depends on `(seed, p)` and integer feature cells only. No caches that change results, no per-chunk random state, no time.
2. Sample positions are `origin + index·cell` with power-of-two cell size → exact doubles.
3. Feature gather pad ≥ `r_max + 8`; the gathered set is a pure function of chunk coords.
4. Noise/hash/float rules of §3.3; a shared test vector file (`seed, x, y, z → f64 bits`) is checked in CI for TS and Rust, plus the 20 000-sample xor checksum.
5. Marching cubes: canonical edge interpolation; the bit convention and table are covered by the table test (§4.2); per-chunk output compared by hash in a cross-language test (`sha256` of the f32 position bytes for a few chunk coords).
6. Colours use only `hash`, `unit01`, lerp and `floor` → identical bytes.
7. Chunk output is independent of generation order; the worker may generate in any order or twice.
8. Physics on a fixed timestep with the same numeric subset; the plane's state after N steps is reproducible → replays and ghosts.

## 10. Risks and open decisions

- **JS-only at 200 u/s with rich detail is at ~50 % of a core.** Choose one: wasm (recommended, 2.9× measured), lean octaves, 2.5-u cells, or a second worker. Decide with the stack research.
- **Roof presentation** in open biomes: rock roof hidden by altitude fog (recommended) vs. open sky with an invisible clamp (worse UX). Needs a visual check once rendering exists.
- **Spine amplitudes vs. plane turn authority**: the table in §2.1 assumes ~170 u/s² lateral; retune after the flight model exists.
- Table validation of a hand-copied Bourke table is mandatory; the probe's generator can produce and check it.
- Non-manifold tangent lines from fan triangulation on ambiguous faces: harmless; centroid fan is the fix if a mesh consumer ever cares.
- Cave biome surface area may double triangle counts; the 12 k per-chunk cap and 200 k budget need re-measuring with the cave parameters.

## 11. Probe measurements (raw)

```
noise.mjs        noise3 57 ns, fbm3(4) 276 ns, vnoise1 5.6 ns, range [-0.912, 0.830]; checksum fe04e98a8fd708c1
noise_port.py    identical bits and checksum (CPython 3.12)
noise.rs         identical bits and checksum; noise3 native 19.9 ns/eval
bench_wasm.mjs   wasm noise3 == js (4 samples); 8-noise workload wasm 172–194 ns/sample vs js 504–539; identical=true
bench_hash.mjs   fmix32 92–98 ns vs 2-round mix 48–49 ns; gradient histogram 0.99–1.02
mc.mjs           tables ok: max 5 tris/case, 820 tris/256 cases; random grid 105 133 tris, 0 open interior edges
                 wall chunk rich: density 22.0 ms full / 14.0 ms shell (23 640 full evals), MC+colour 0.6–1.2 ms, 1 704 tris
                 wall chunk lean: 15.1 / 10.3 ms, 1 604 tris
                 census 10 slabs: 168 candidates (16.8/slab), 79 non-empty (7.9/slab); 198 738 tris (19 874/slab),
                 median 2 792 / max 4 912 per chunk; rich 158 ms/slab (9.4 ms/candidate), lean 114 ms/slab (6.8)
                 memory at 640 u: 15.4 MB (f32 pos+nrm+u8 col) → 9.6 MB without normals, 6.8 MB compact
bench_base.mjs   baseDensity 6–20 ns/sample (0.2–0.7 ms per 33³), spine×33 0.013 ms
```

## 12. Probe files

`(scratchpad)/probes/terrain/`

- `noise.mjs` — reference noise (hash, gradient, value, fBm, ridged, smin/smax), self-test + timing.
- `noise_port.py`, `noise.rs`, `noise_wasm.rs` (+ `noise_wasm.wasm`, `bench_wasm.mjs`) — cross-language bit checks and timings.
- `bench_grad.mjs`, `bench_hash.mjs`, `bench_base.mjs` — micro-benchmarks behind §3.4 and §4.4.
- `mc.mjs` — table generation + validation, canyon density field with per-chunk feature gather and shell skip, non-indexed flat-shaded mesher with per-face colour, slab census (`QUALITY=lean node mc.mjs` for the lean variant).
- `debug_dups.mjs`, `debug_dups2.mjs` — investigation of the tangent-line edges in the random-grid test.
