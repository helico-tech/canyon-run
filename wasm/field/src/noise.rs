//! Port of src/terrain/noise.ts. Every operation mirrors the JavaScript one:
//! wrapping 32-bit integer arithmetic for the hashes and plain binary64 for the
//! rest, in the same order, so results are bit-identical.

#[inline]
pub fn to_i32(f: f64) -> i32 {
    // JavaScript ToInt32: modulo 2^32 (never out of i64 range here).
    (f as i64) as i32
}

#[inline]
pub fn fmix32(mut h: u32) -> u32 {
    h ^= h >> 16;
    h = h.wrapping_mul(0x85eb_ca6b);
    h ^= h >> 13;
    h = h.wrapping_mul(0xc2b2_ae35);
    h ^= h >> 16;
    h
}

#[inline]
pub fn hash2(ix: i32, iy: i32, seed: u32) -> u32 {
    fmix32((ix as u32).wrapping_mul(0x8da6_b343) ^ (iy as u32).wrapping_mul(0xd816_3841) ^ seed)
}

#[inline]
pub fn unit01(h: u32) -> f64 {
    ((h >> 8) as f64) * (1.0 / 16_777_216.0)
}

#[inline]
pub fn fade(t: f64) -> f64 {
    t * t * t * (t * (t * 6.0 - 15.0) + 10.0)
}

#[inline]
pub fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}

#[inline]
pub fn clamp(x: f64, lo: f64, hi: f64) -> f64 {
    if x < lo {
        lo
    } else if x > hi {
        hi
    } else {
        x
    }
}

#[inline]
pub fn smoothstep(e0: f64, e1: f64, x: f64) -> f64 {
    let t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// JavaScript Math.max for two finite numbers: +0 beats -0.
#[inline]
pub fn jmax(a: f64, b: f64) -> f64 {
    if a > b {
        a
    } else if b > a {
        b
    } else if a == 0.0 && b == 0.0 {
        if a.is_sign_negative() {
            b
        } else {
            a
        }
    } else {
        a
    }
}

/// JavaScript Math.min for two finite numbers: -0 beats +0.
#[inline]
pub fn jmin(a: f64, b: f64) -> f64 {
    if a < b {
        a
    } else if b < a {
        b
    } else if a == 0.0 && b == 0.0 {
        if a.is_sign_negative() {
            a
        } else {
            b
        }
    } else {
        a
    }
}

#[inline]
pub fn smin(a: f64, b: f64, k: f64) -> f64 {
    let h = jmax(k - (a - b).abs(), 0.0) / k;
    jmin(a, b) - h * h * k * 0.25
}

#[inline]
pub fn smax(a: f64, b: f64, k: f64) -> f64 {
    -smin(-a, -b, k)
}

const GRAD: [f64; 48] = [
    1.0, 1.0, 0.0, -1.0, 1.0, 0.0, 1.0, -1.0, 0.0, -1.0, -1.0, 0.0, 1.0, 0.0, 1.0, -1.0, 0.0, 1.0,
    1.0, 0.0, -1.0, -1.0, 0.0, -1.0, 0.0, 1.0, 1.0, 0.0, -1.0, 1.0, 0.0, 1.0, -1.0, 0.0, -1.0,
    -1.0, 1.0, 1.0, 0.0, 0.0, -1.0, 1.0, -1.0, 1.0, 0.0, 0.0, -1.0, -1.0,
];

#[inline]
fn mix(mut h: u32) -> u32 {
    h = (h ^ (h >> 15)).wrapping_mul(0x2c1b_3c6d);
    h = (h ^ (h >> 12)).wrapping_mul(0x297a_2d39);
    h ^ (h >> 15)
}

#[inline]
fn grad3(h: u32, x: f64, y: f64, z: f64) -> f64 {
    let i = ((h >> 28) * 3) as usize;
    GRAD[i] * x + GRAD[i + 1] * y + GRAD[i + 2] * z
}

pub fn noise3(mut x: f64, mut y: f64, mut z: f64, seed: u32) -> f64 {
    let fx = x.floor();
    let fy = y.floor();
    let fz = z.floor();
    let ix = to_i32(fx) as u32;
    let iy = to_i32(fy) as u32;
    let iz = to_i32(fz) as u32;
    x -= fx;
    y -= fy;
    z -= fz;
    let u = fade(x);
    let v = fade(y);
    let w = fade(z);
    let hx0 = ix.wrapping_mul(0x8da6_b343) ^ seed;
    let hx1 = ix.wrapping_add(1).wrapping_mul(0x8da6_b343) ^ seed;
    let hy0 = iy.wrapping_mul(0xd816_3841);
    let hy1 = iy.wrapping_add(1).wrapping_mul(0xd816_3841);
    let hz0 = iz.wrapping_mul(0xcb1a_b31f);
    let hz1 = iz.wrapping_add(1).wrapping_mul(0xcb1a_b31f);
    let n000 = grad3(mix(hx0 ^ hy0 ^ hz0), x, y, z);
    let n100 = grad3(mix(hx1 ^ hy0 ^ hz0), x - 1.0, y, z);
    let n010 = grad3(mix(hx0 ^ hy1 ^ hz0), x, y - 1.0, z);
    let n110 = grad3(mix(hx1 ^ hy1 ^ hz0), x - 1.0, y - 1.0, z);
    let n001 = grad3(mix(hx0 ^ hy0 ^ hz1), x, y, z - 1.0);
    let n101 = grad3(mix(hx1 ^ hy0 ^ hz1), x - 1.0, y, z - 1.0);
    let n011 = grad3(mix(hx0 ^ hy1 ^ hz1), x, y - 1.0, z - 1.0);
    let n111 = grad3(mix(hx1 ^ hy1 ^ hz1), x - 1.0, y - 1.0, z - 1.0);
    let x00 = lerp(n000, n100, u);
    let x10 = lerp(n010, n110, u);
    let x01 = lerp(n001, n101, u);
    let x11 = lerp(n011, n111, u);
    lerp(lerp(x00, x10, v), lerp(x01, x11, v), w)
}

pub fn vnoise2(x: f64, y: f64, seed: u32) -> f64 {
    let fx = x.floor();
    let fy = y.floor();
    let ix = to_i32(fx);
    let iy = to_i32(fy);
    let u = fade(x - fx);
    let v = fade(y - fy);
    let a = unit01(hash2(ix, iy, seed));
    let b = unit01(hash2(ix.wrapping_add(1), iy, seed));
    let c = unit01(hash2(ix, iy.wrapping_add(1), seed));
    let d = unit01(hash2(ix.wrapping_add(1), iy.wrapping_add(1), seed));
    lerp(lerp(a, b, u), lerp(c, d, u), v) * 2.0 - 1.0
}

const GOLD: u32 = 0x9e37_79b9;

#[inline]
pub fn seed_octave(seed: u32, i: u32) -> u32 {
    seed.wrapping_add(GOLD.wrapping_mul(i.wrapping_add(1)))
}

pub fn fbm3(mut x: f64, mut y: f64, mut z: f64, seed: u32, octaves: u32) -> f64 {
    let mut amp = 1.0;
    let mut sum = 0.0;
    let mut norm = 0.0;
    for i in 0..octaves {
        sum += amp * noise3(x, y, z, seed_octave(seed, i));
        norm += amp;
        x *= 2.0;
        y *= 2.0;
        z *= 2.0;
        amp *= 0.5;
    }
    sum / norm
}

pub fn fbm2(mut x: f64, mut y: f64, seed: u32, octaves: u32) -> f64 {
    let mut amp = 1.0;
    let mut sum = 0.0;
    let mut norm = 0.0;
    for i in 0..octaves {
        sum += amp * vnoise2(x, y, seed_octave(seed, i));
        norm += amp;
        x *= 2.0;
        y *= 2.0;
        amp *= 0.5;
    }
    sum / norm
}

pub fn ridged3(mut x: f64, mut y: f64, mut z: f64, seed: u32, octaves: u32) -> f64 {
    let mut amp = 1.0;
    let mut sum = 0.0;
    let mut norm = 0.0;
    let mut weight = 1.0;
    for i in 0..octaves {
        let mut n = noise3(x, y, z, seed_octave(seed, i));
        n = 1.0 - n.abs();
        n = n * n * weight;
        weight = if n > 1.0 { 1.0 } else { n };
        sum += n * amp;
        norm += amp;
        x *= 2.0;
        y *= 2.0;
        z *= 2.0;
        amp *= 0.5;
    }
    sum / norm
}
