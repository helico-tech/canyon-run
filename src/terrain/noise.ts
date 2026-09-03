// Deterministic hash-based noise (ADR 0002, ADR 0004). Only int32 ops and f64
// add/mul/div/floor/abs, so results are bit-identical on every engine.
// Every function takes a 32-bit seed.

/** murmur3 finaliser: all 32 output bits are well mixed. */
export function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Lattice hashes: integer coordinates and a seed to a u32. */
export function hash3(ix: number, iy: number, iz: number, seed: number): number {
  return fmix32(
    (Math.imul(ix, 0x8da6b343) ^ Math.imul(iy, 0xd8163841) ^ Math.imul(iz, 0xcb1ab31f) ^ seed) | 0,
  );
}
export function hash2(ix: number, iy: number, seed: number): number {
  return fmix32((Math.imul(ix, 0x8da6b343) ^ Math.imul(iy, 0xd8163841) ^ seed) | 0);
}
export function hash1(ix: number, seed: number): number {
  return fmix32((Math.imul(ix, 0x8da6b343) ^ seed) | 0);
}

/** u32 to [0, 1): the top 24 bits times 2^-24 is exact in binary64. */
export function unit01(h: number): number {
  return (h >>> 8) * (1 / 16777216);
}

/** Quintic fade, C2 continuous. */
export function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Polynomial smooth min/max (Quilez): rounded creases with radius k. */
export function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
export function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

// 12 edge-direction gradients plus 4 duplicates so selection is a 4-bit shift.
const GRAD = new Float64Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1,
  0, 1, -1, 0, -1, -1, 1, 1, 0, 0, -1, 1, -1, 1, 0, 0, -1, -1,
]);

/** Cheap lattice mix: two multiply-xorshift rounds; only the top 4 bits are consumed. */
function mix(h: number): number {
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}
function grad3(h: number, x: number, y: number, z: number): number {
  const i = (h >>> 28) * 3;
  return GRAD[i]! * x + GRAD[i + 1]! * y + GRAD[i + 2]! * z;
}

/** 3D Perlin-lattice gradient noise, range about [-0.92, 0.92]. */
export function noise3(x: number, y: number, z: number, seed: number): number {
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  const fz = Math.floor(z);
  const ix = fx | 0;
  const iy = fy | 0;
  const iz = fz | 0;
  x -= fx;
  y -= fy;
  z -= fz;
  const u = fade(x);
  const v = fade(y);
  const w = fade(z);
  const hx0 = Math.imul(ix, 0x8da6b343) ^ seed;
  const hx1 = Math.imul(ix + 1, 0x8da6b343) ^ seed;
  const hy0 = Math.imul(iy, 0xd8163841);
  const hy1 = Math.imul(iy + 1, 0xd8163841);
  const hz0 = Math.imul(iz, 0xcb1ab31f);
  const hz1 = Math.imul(iz + 1, 0xcb1ab31f);
  const n000 = grad3(mix(hx0 ^ hy0 ^ hz0), x, y, z);
  const n100 = grad3(mix(hx1 ^ hy0 ^ hz0), x - 1, y, z);
  const n010 = grad3(mix(hx0 ^ hy1 ^ hz0), x, y - 1, z);
  const n110 = grad3(mix(hx1 ^ hy1 ^ hz0), x - 1, y - 1, z);
  const n001 = grad3(mix(hx0 ^ hy0 ^ hz1), x, y, z - 1);
  const n101 = grad3(mix(hx1 ^ hy0 ^ hz1), x - 1, y, z - 1);
  const n011 = grad3(mix(hx0 ^ hy1 ^ hz1), x, y - 1, z - 1);
  const n111 = grad3(mix(hx1 ^ hy1 ^ hz1), x - 1, y - 1, z - 1);
  const x00 = lerp(n000, n100, u);
  const x10 = lerp(n010, n110, u);
  const x01 = lerp(n001, n101, u);
  const x11 = lerp(n011, n111, u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}

/** 1D value noise, quintic, range [-1, 1]. C2, so curvature is continuous. */
export function vnoise1(x: number, seed: number): number {
  const fx = Math.floor(x);
  const ix = fx | 0;
  const t = fade(x - fx);
  const a = unit01(hash1(ix, seed)) * 2 - 1;
  const b = unit01(hash1(ix + 1, seed)) * 2 - 1;
  return lerp(a, b, t);
}

/** 2D value noise, quintic, range [-1, 1]. */
export function vnoise2(x: number, y: number, seed: number): number {
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  const ix = fx | 0;
  const iy = fy | 0;
  const u = fade(x - fx);
  const v = fade(y - fy);
  const a = unit01(hash2(ix, iy, seed));
  const b = unit01(hash2(ix + 1, iy, seed));
  const c = unit01(hash2(ix, iy + 1, seed));
  const d = unit01(hash2(ix + 1, iy + 1, seed));
  return lerp(lerp(a, b, u), lerp(c, d, u), v) * 2 - 1;
}

const GOLD = 0x9e3779b9 | 0;
export function seedOctave(seed: number, i: number): number {
  return (seed + Math.imul(GOLD, i + 1)) | 0;
}

/** Fractal Brownian motion normalised to about [-1, 1]. Octave order is part of the contract. */
export function fbm3(
  x: number,
  y: number,
  z: number,
  seed: number,
  octaves: number,
  lacunarity = 2,
  gain = 0.5,
): number {
  let amp = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x, y, z, seedOctave(seed, i));
    norm += amp;
    x *= lacunarity;
    y *= lacunarity;
    z *= lacunarity;
    amp *= gain;
  }
  return sum / norm;
}
export function fbm2(
  x: number,
  y: number,
  seed: number,
  octaves: number,
  lacunarity = 2,
  gain = 0.5,
): number {
  let amp = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise2(x, y, seedOctave(seed, i));
    norm += amp;
    x *= lacunarity;
    y *= lacunarity;
    amp *= gain;
  }
  return sum / norm;
}
export function fbm1(x: number, seed: number, octaves: number, lacunarity = 2, gain = 0.5): number {
  let amp = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise1(x, seedOctave(seed, i));
    norm += amp;
    x *= lacunarity;
    amp *= gain;
  }
  return sum / norm;
}

/** Musgrave ridged multifractal, range [0, 1]. Sharp crests read as strata and flutes. */
export function ridged3(
  x: number,
  y: number,
  z: number,
  seed: number,
  octaves: number,
  lacunarity = 2,
  gain = 0.5,
): number {
  let amp = 1;
  let sum = 0;
  let norm = 0;
  let weight = 1;
  for (let i = 0; i < octaves; i++) {
    let n = noise3(x, y, z, seedOctave(seed, i));
    n = 1 - Math.abs(n);
    n = n * n * weight;
    weight = n > 1 ? 1 : n;
    sum += n * amp;
    norm += amp;
    x *= lacunarity;
    y *= lacunarity;
    z *= lacunarity;
    amp *= gain;
  }
  return sum / norm;
}
