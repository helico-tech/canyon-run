//! Port of the hot path of src/terrain/field.ts, features.ts (evaluation) and
//! chunk.ts (shell skip). Parameter indices follow src/terrain/wasmLayout.ts.
use crate::noise::*;

pub const P_HEIGHT: usize = 0;
pub const P_CORE_RADIUS: usize = 1;
pub const P_PROFILE_LIP: usize = 2;
pub const P_PROFILE_OVERHANG: usize = 3;
pub const P_TUBENESS: usize = 4;
pub const P_ROOF_OPEN: usize = 5;
pub const P_STALACTITE_AMP: usize = 6;
pub const P_STALAGMITE_AMP: usize = 7;
pub const P_SPIKE_LEN: usize = 8;
pub const P_WARP_AMP: usize = 9;
pub const P_WARP_LEN: usize = 10;
pub const P_WARP_OCT: usize = 11;
pub const P_RIDGE_AMP: usize = 12;
pub const P_RIDGE_LEN: usize = 13;
pub const P_RIDGE_Y_STRETCH: usize = 14;
pub const P_RIDGE_OCT: usize = 15;
pub const P_FLOOR_NOISE_AMP: usize = 16;
pub const P_FLOOR_NOISE_LEN: usize = 17;
pub const P_CEIL_NOISE_AMP: usize = 18;
pub const P_CEIL_NOISE_LEN: usize = 19;
pub const P_HEIGHT_OCT: usize = 20;
pub const P_DETAIL_AMP: usize = 21;
pub const P_DETAIL_LEN: usize = 22;
pub const P_SMOOTH_K: usize = 23;
pub const P_TUNNEL_PROB: usize = 24;
pub const PARAM_COUNT: usize = 25;

pub const FEATURE_FLOATS: usize = 12;
const F_KIND: usize = 0;
const F_X: usize = 1;
const F_Y: usize = 2;
const F_Z: usize = 3;
const F_R: usize = 4;
const F_BIG: usize = 5;
const F_REACH: usize = 6;
const F_DX: usize = 7;
const F_DY: usize = 8;
const F_DZ: usize = 9;
const F_BIG2: usize = 10;

const FEATURE_PILLAR: f64 = 0.0;
const FEATURE_BOULDER: f64 = 1.0;
const FEATURE_TUNNEL: f64 = 3.0;
const FEATURE_CRYSTAL: f64 = 4.0;
const FEATURE_MESA: f64 = 5.0;
const FEATURE_ROCK: f64 = 6.0;
const FEATURE_GATE: f64 = 7.0;
const FEATURE_BOX: f64 = 8.0;
const FEATURE_CLAMP: f64 = 40.0;
const GATE_SILL_H: f64 = 2.0;
const GATE_SILL_D: f64 = 2.5;

#[derive(Clone, Copy)]
pub struct Spine {
    pub cx: f64,
    pub floor_y: f64,
    pub ceil_y: f64,
    pub core_y: f64,
    pub hw: f64,
}

impl Spine {
    pub fn from_slice(s: &[f64]) -> Spine {
        Spine {
            cx: s[0],
            floor_y: s[1],
            ceil_y: s[2],
            core_y: s[3],
            hw: s[4],
        }
    }
}

#[inline]
fn profile(p: &[f64], h: f64) -> f64 {
    1.0 + p[P_PROFILE_LIP] * smoothstep(0.0, 1.0, h)
        - p[P_PROFILE_OVERHANG] * smoothstep(0.7, 1.0, h)
}

#[inline]
fn tube_distance(p: &[f64], sp: &Spine, x: f64, y: f64) -> f64 {
    let hh = p[P_HEIGHT] * 0.5;
    let ex = (x - sp.cx) / sp.hw;
    let ey = (y - (sp.floor_y + hh)) / hh;
    let r = (ex * ex + ey * ey).sqrt();
    (r - 1.0) * (if sp.hw < hh { sp.hw } else { hh })
}

pub fn base_density(p: &[f64], sp: &Spine, x: f64, y: f64) -> f64 {
    let h = (y - sp.floor_y) / p[P_HEIGHT];
    let sd_wall = (x - sp.cx).abs() - sp.hw * profile(p, h);
    let sd_floor = sp.floor_y - y;
    let sd_ceil = if p[P_ROOF_OPEN] > 0.0 {
        -1e9
    } else {
        y - sp.ceil_y
    };
    let slot = jmax(jmax(sd_wall, sd_floor), sd_ceil);
    if p[P_TUBENESS] > 0.0 {
        lerp(slot, tube_distance(p, sp, x, y), p[P_TUBENESS])
    } else {
        slot
    }
}

#[inline]
pub fn core_distance(p: &[f64], sp: &Spine, x: f64, y: f64) -> f64 {
    let dx = x - sp.cx;
    let dy = y - sp.core_y;
    (dx * dx + dy * dy).sqrt() - p[P_CORE_RADIUS]
}

pub fn tunnels_sd(x: f64, y: f64, z: f64, feats: &[f64]) -> f64 {
    let mut best = FEATURE_CLAMP;
    let n = feats.len() / FEATURE_FLOATS;
    for i in 0..n {
        let f = &feats[i * FEATURE_FLOATS..(i + 1) * FEATURE_FLOATS];
        if f[F_KIND] != FEATURE_TUNNEL {
            continue;
        }
        let dx = x - f[F_X];
        let dz = z - f[F_Z];
        let reach = f[F_REACH];
        if dx > reach || dx < -reach || dz > reach || dz < -reach {
            continue;
        }
        let dy = y - f[F_Y];
        let mut t = dx * f[F_DX] + dy * f[F_DY] + dz * f[F_DZ];
        t = if t < 0.0 {
            0.0
        } else if t > f[F_BIG] {
            f[F_BIG]
        } else {
            t
        };
        let qx = dx - f[F_DX] * t;
        let qy = dy - f[F_DY] * t;
        let qz = dz - f[F_DZ] * t;
        let sd = (qx * qx + qy * qy + qz * qz).sqrt() - f[F_R];
        if sd < best {
            best = sd;
        }
    }
    best
}

fn crystal_sd(f: &[f64], dx: f64, dy: f64, dz: f64) -> f64 {
    let y1 = f[F_DZ] * dy + f[F_BIG2] * dz;
    let z1 = -f[F_BIG2] * dy + f[F_DZ] * dz;
    let x2 = f[F_DX] * dx + f[F_DY] * y1;
    let y2 = -f[F_DY] * dx + f[F_DX] * y1;
    let ax = x2.abs();
    let az = z1.abs();
    let hex = jmax(ax * 0.866 + az * 0.5, az) - f[F_R];
    let cap = (y2 - f[F_BIG] * 0.5).abs() - f[F_BIG] * 0.5;
    jmax(hex, cap)
}

fn gate_sd(f: &[f64], dx: f64, dy: f64, dz: f64) -> f64 {
    let big = f[F_BIG];
    let big2 = f[F_BIG2];
    let r = f[F_R];
    let ax = dx.abs() - big;
    let ty = if dy < 0.0 {
        0.0
    } else if dy > big2 {
        big2
    } else {
        dy
    };
    let pillar = (ax * ax + (dy - ty) * (dy - ty) + dz * dz).sqrt() - r;
    let lx = if dx < -big {
        -big
    } else if dx > big {
        big
    } else {
        dx
    };
    let ly = dy - big2;
    let lintel = ((dx - lx) * (dx - lx) + ly * ly + dz * dz).sqrt() - r;
    let qx = dx.abs() - big;
    let qy = (dy - 4.0).abs() - GATE_SILL_H;
    let qz = dz.abs() - GATE_SILL_D;
    let px = if qx > 0.0 { qx } else { 0.0 };
    let py = if qy > 0.0 { qy } else { 0.0 };
    let pz = if qz > 0.0 { qz } else { 0.0 };
    let inner = if qx > qy {
        if qx > qz {
            qx
        } else {
            qz
        }
    } else if qy > qz {
        qy
    } else {
        qz
    };
    let sill = (px * px + py * py + pz * pz).sqrt() + (if inner < 0.0 { inner } else { 0.0 }) - 0.5;
    let frame = if pillar < lintel { pillar } else { lintel };
    if frame < sill {
        frame
    } else {
        sill
    }
}

pub fn features_sd(seed: u32, x: f64, y: f64, z: f64, feats: &[f64]) -> f64 {
    let mut best = FEATURE_CLAMP;
    let n = feats.len() / FEATURE_FLOATS;
    for i in 0..n {
        let f = &feats[i * FEATURE_FLOATS..(i + 1) * FEATURE_FLOATS];
        let kind = f[F_KIND];
        if kind == FEATURE_TUNNEL {
            continue;
        }
        let dx = x - f[F_X];
        let dz = z - f[F_Z];
        let reach = f[F_REACH];
        if dx > reach || dx < -reach || dz > reach || dz < -reach {
            continue;
        }
        let r = f[F_R];
        let sd;
        if kind == FEATURE_PILLAR {
            let d0 = (dx * dx + dz * dz).sqrt() - r;
            if d0 - 0.55 * r >= best {
                continue;
            }
            let mut bulge =
                1.0 + 0.25 * noise3(f[F_X] * 0.05, y * 0.08, f[F_Z] * 0.05, seed ^ 0x5555);
            if f[F_BIG2] > 0.0 {
                bulge += 0.3 * ((to_i32((y / f[F_BIG2]).floor()) & 1) as f64);
            }
            sd = d0 - r * (bulge - 1.0);
        } else if kind == FEATURE_BOULDER {
            let dy = y - f[F_Y];
            let d0 = (dx * dx + dy * dy + dz * dz).sqrt() - r;
            if d0 - 0.2 * r >= best {
                continue;
            }
            let bulge = 1.0 + 0.2 * noise3(x * 0.15, y * 0.15, z * 0.15, seed ^ 0x6555);
            sd = d0 - r * (bulge - 1.0);
        } else if kind == FEATURE_CRYSTAL {
            sd = crystal_sd(f, dx, y - f[F_Y], dz);
        } else if kind == FEATURE_ROCK {
            let dy = y - f[F_Y];
            let fdx = f[F_DX];
            let fdy = f[F_DY];
            let fdz = f[F_DZ];
            let ex = dx / (r * fdx);
            let ey = dy / (r * fdy);
            let ez = dz / (r * fdz);
            let min_axis = r
                * (if fdx < fdy {
                    if fdx < fdz {
                        fdx
                    } else {
                        fdz
                    }
                } else if fdy < fdz {
                    fdy
                } else {
                    fdz
                });
            let d0 = ((ex * ex + ey * ey + ez * ez).sqrt() - 1.0) * min_axis;
            if d0 - 0.2 * r >= best {
                continue;
            }
            let bulge = 0.2 * r * noise3(x * 0.12, y * 0.12, z * 0.12, seed ^ 0xb777);
            sd = d0 - bulge;
        } else if kind == FEATURE_GATE {
            sd = gate_sd(f, dx, y - f[F_Y], dz);
        } else if kind == FEATURE_BOX {
            let qx = dx.abs() - r + 1.0;
            let qy = (y - f[F_Y]).abs() - f[F_BIG] + 1.0;
            let qz = dz.abs() - f[F_BIG2] + 1.0;
            let ox = if qx > 0.0 { qx } else { 0.0 };
            let oy = if qy > 0.0 { qy } else { 0.0 };
            let oz = if qz > 0.0 { qz } else { 0.0 };
            let inside = jmax(qx, jmax(qy, qz));
            sd = (ox * ox + oy * oy + oz * oz).sqrt() + (if inside < 0.0 { inside } else { 0.0 })
                - 1.0;
        } else if kind == FEATURE_MESA {
            let qx = dx.abs() - r + 3.0;
            let qy = (y - f[F_Y] - f[F_BIG] * 0.5).abs() - f[F_BIG] * 0.5 + 3.0;
            let qz = dz.abs() - f[F_BIG2] + 3.0;
            let ox = if qx > 0.0 { qx } else { 0.0 };
            let oy = if qy > 0.0 { qy } else { 0.0 };
            let oz = if qz > 0.0 { qz } else { 0.0 };
            let inside = jmax(qx, jmax(qy, qz));
            sd = (ox * ox + oy * oy + oz * oz).sqrt() + (if inside < 0.0 { inside } else { 0.0 })
                - 3.0;
        } else {
            let dy = y - f[F_Y];
            let ring = (dx * dx + dy * dy).sqrt() - f[F_BIG];
            sd = (ring * ring + dz * dz).sqrt() - r;
        }
        if sd < best {
            best = sd;
        }
    }
    best
}

pub fn biome_density(
    seed: u32,
    p: &[f64],
    sp: &Spine,
    feats: &[f64],
    x: f64,
    y: f64,
    z: f64,
) -> f64 {
    let wf = 1.0 / p[P_WARP_LEN];
    let warp_oct = p[P_WARP_OCT] as u32;
    let px = x + p[P_WARP_AMP] * fbm3(x * wf, y * wf, z * wf, seed ^ 11, warp_oct);
    let py = y + p[P_WARP_AMP] * fbm3(x * wf + 31.7, y * wf, z * wf + 17.1, seed ^ 12, warp_oct);
    let h = (py - sp.floor_y) / p[P_HEIGHT];
    let rf = 1.0 / p[P_RIDGE_LEN];
    let ridge = (ridged3(
        px * rf,
        py * rf * p[P_RIDGE_Y_STRETCH],
        z * rf,
        seed ^ 13,
        p[P_RIDGE_OCT] as u32,
    ) - 0.5)
        * 2.0
        * p[P_RIDGE_AMP];
    let sd_wall = (px - sp.cx).abs() - sp.hw * profile(p, h) + ridge;
    let ff = 1.0 / p[P_FLOOR_NOISE_LEN];
    let height_oct = p[P_HEIGHT_OCT] as u32;
    let mut sd_floor =
        sp.floor_y - py + p[P_FLOOR_NOISE_AMP] * fbm2(px * ff, z * ff, seed ^ 14, height_oct);
    let cf = 1.0 / p[P_CEIL_NOISE_LEN];
    let mut sd_ceil = if p[P_ROOF_OPEN] > 0.0 {
        -1e9
    } else {
        py - sp.ceil_y + p[P_CEIL_NOISE_AMP] * fbm2(px * cf, z * cf, seed ^ 15, height_oct)
    };
    if p[P_STALACTITE_AMP] > 0.0 || p[P_STALAGMITE_AMP] > 0.0 {
        let sf = 1.0 / p[P_SPIKE_LEN];
        let r = ridged3(px * sf, 0.0, z * sf, seed ^ 17, 2);
        let spike = r * r * r;
        sd_ceil += p[P_STALACTITE_AMP] * spike;
        sd_floor += p[P_STALAGMITE_AMP] * spike;
    }
    let k = p[P_SMOOTH_K];
    let mut d = smax(smax(sd_wall, sd_floor, k), sd_ceil, k);
    if p[P_TUBENESS] > 0.0 {
        let tube = tube_distance(p, sp, px, py) + ridge * 0.5;
        d = lerp(d, smax(tube, sd_floor, k), p[P_TUBENESS]);
    }
    let df = 1.0 / p[P_DETAIL_LEN];
    d += p[P_DETAIL_AMP] * noise3(x * df, y * df, z * df, seed ^ 16);
    d = jmax(d, -features_sd(seed, x, y, z, feats));
    if p[P_TUNNEL_PROB] > 0.0 {
        d = jmin(d, tunnels_sd(x, y, z, feats));
    }
    d
}
