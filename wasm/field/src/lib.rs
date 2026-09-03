//! Canyon Run density field in wasm (ADR 0009). No allocation, no imports: the
//! host writes parameters, spines, feature records and a row descriptor into
//! the exported buffers and calls `fill_row` for each of the 33 rows of a chunk.
#![allow(clippy::missing_safety_doc)]
mod density;
mod noise;

use core::ptr::addr_of_mut;
use core::slice;
use density::*;
use noise::{jmax, jmin, lerp};

const LAYOUT_VERSION: u32 = 1;
const CELLS: usize = 32;
const SAMPLES: usize = CELLS + 1;
const CELL_SIZE: f64 = 2.0;
const GRID_LENGTH: usize = SAMPLES * SAMPLES * SAMPLES;
const PARAM_SLOTS: usize = 5;
const SLOT_PA: usize = 0;
const SLOT_PB: usize = 1;
const SLOT_MIX: usize = 2;
const SLOT_BA: usize = 3;
const SLOT_BB: usize = 4;
const SPINE_FLOATS: usize = 5;
const SPINE_SLOTS: usize = 3;
const FEATURE_CAPACITY: usize = 1024;
const ROW_FLOATS: usize = 6;

static mut GRID: [f64; GRID_LENGTH] = [0.0; GRID_LENGTH];
static mut PARAMS: [f64; PARAM_COUNT * PARAM_SLOTS] = [0.0; PARAM_COUNT * PARAM_SLOTS];
static mut SPINES: [f64; SPINE_FLOATS * SPINE_SLOTS] = [0.0; SPINE_FLOATS * SPINE_SLOTS];
static mut FEATS_A: [f64; FEATURE_FLOATS * FEATURE_CAPACITY] =
    [0.0; FEATURE_FLOATS * FEATURE_CAPACITY];
static mut FEATS_B: [f64; FEATURE_FLOATS * FEATURE_CAPACITY] =
    [0.0; FEATURE_FLOATS * FEATURE_CAPACITY];
static mut ROW: [f64; ROW_FLOATS] = [0.0; ROW_FLOATS];
static mut ORIGIN: [f64; 3] = [0.0; 3];

#[no_mangle]
pub extern "C" fn layout_version() -> u32 {
    LAYOUT_VERSION
}

#[no_mangle]
pub extern "C" fn param_count() -> u32 {
    PARAM_COUNT as u32
}

#[no_mangle]
pub extern "C" fn grid_ptr() -> *mut f64 {
    addr_of_mut!(GRID) as *mut f64
}

#[no_mangle]
pub extern "C" fn params_ptr() -> *mut f64 {
    addr_of_mut!(PARAMS) as *mut f64
}

#[no_mangle]
pub extern "C" fn spines_ptr() -> *mut f64 {
    addr_of_mut!(SPINES) as *mut f64
}

#[no_mangle]
pub extern "C" fn feats_ptr(list: u32) -> *mut f64 {
    if list == 0 {
        addr_of_mut!(FEATS_A) as *mut f64
    } else {
        addr_of_mut!(FEATS_B) as *mut f64
    }
}

#[no_mangle]
pub extern "C" fn row_ptr() -> *mut f64 {
    addr_of_mut!(ROW) as *mut f64
}

#[no_mangle]
pub extern "C" fn begin_chunk(ox: f64, oy: f64, oz: f64) {
    let o = addr_of_mut!(ORIGIN) as *mut f64;
    // SAFETY: single-threaded wasm; the host never calls into the module re-entrantly.
    unsafe {
        *o = ox;
        *o.add(1) = oy;
        *o.add(2) = oz;
    }
}

/// Fills row `zi` of the grid exactly as chunk.ts fillGrid does; returns the
/// number of full evaluations in the row (the rest were base-only).
#[no_mangle]
pub extern "C" fn fill_row(zi: u32) -> u32 {
    // SAFETY: single-threaded wasm; the host writes the buffers before each call
    // and never calls into the module re-entrantly.
    unsafe {
        let grid = slice::from_raw_parts_mut(addr_of_mut!(GRID) as *mut f64, GRID_LENGTH);
        let params = slice::from_raw_parts(
            addr_of_mut!(PARAMS) as *const f64,
            PARAM_COUNT * PARAM_SLOTS,
        );
        let spines = slice::from_raw_parts(
            addr_of_mut!(SPINES) as *const f64,
            SPINE_FLOATS * SPINE_SLOTS,
        );
        let row = slice::from_raw_parts(addr_of_mut!(ROW) as *const f64, ROW_FLOATS);
        let origin = slice::from_raw_parts(addr_of_mut!(ORIGIN) as *const f64, 3);
        let t = row[0];
        let bound = row[1] + 3f64.sqrt() * CELL_SIZE;
        let seed = row[2] as u32;
        let n_a = row[3] as usize;
        let n_b = row[4] as usize;
        let a_is_b = row[5] != 0.0;
        let feats_a =
            slice::from_raw_parts(addr_of_mut!(FEATS_A) as *const f64, n_a * FEATURE_FLOATS);
        let feats_b =
            slice::from_raw_parts(addr_of_mut!(FEATS_B) as *const f64, n_b * FEATURE_FLOATS);
        let pa = &params[SLOT_PA * PARAM_COUNT..(SLOT_PA + 1) * PARAM_COUNT];
        let pb = &params[SLOT_PB * PARAM_COUNT..(SLOT_PB + 1) * PARAM_COUNT];
        let pmix = &params[SLOT_MIX * PARAM_COUNT..(SLOT_MIX + 1) * PARAM_COUNT];
        let ba = &params[SLOT_BA * PARAM_COUNT..(SLOT_BA + 1) * PARAM_COUNT];
        let bb = &params[SLOT_BB * PARAM_COUNT..(SLOT_BB + 1) * PARAM_COUNT];
        let sp_a = Spine::from_slice(&spines[0..SPINE_FLOATS]);
        let sp_b = Spine::from_slice(&spines[SPINE_FLOATS..2 * SPINE_FLOATS]);
        let sp_mix = Spine::from_slice(&spines[2 * SPINE_FLOATS..3 * SPINE_FLOATS]);
        let single_base = a_is_b || t == 0.0;
        let single = t == 0.0;
        let z = zi as usize;
        let wz = origin[2] + (z as f64) * CELL_SIZE;
        let mut full = 0u32;
        for y in 0..SAMPLES {
            let wy = origin[1] + (y as f64) * CELL_SIZE;
            for x in 0..SAMPLES {
                let wx = origin[0] + (x as f64) * CELL_SIZE;
                let base = if single_base {
                    base_density(ba, &sp_a, wx, wy)
                } else {
                    lerp(
                        base_density(ba, &sp_a, wx, wy),
                        base_density(bb, &sp_b, wx, wy),
                        t,
                    )
                };
                let i = x + SAMPLES * (y + SAMPLES * z);
                if base > bound {
                    let core = if single_base {
                        core_distance(pa, &sp_a, wx, wy)
                    } else {
                        core_distance(pmix, &sp_mix, wx, wy)
                    };
                    grid[i] = jmin(base, core);
                } else if base < -bound {
                    let fa = -features_sd(seed, wx, wy, wz, feats_a);
                    let rock = if single {
                        fa
                    } else {
                        lerp(fa, -features_sd(seed, wx, wy, wz, feats_b), t)
                    };
                    grid[i] = jmax(base, rock);
                } else {
                    grid[i] = if single {
                        jmin(
                            biome_density(seed, pa, &sp_a, feats_a, wx, wy, wz),
                            core_distance(pa, &sp_a, wx, wy),
                        )
                    } else {
                        let da = biome_density(seed, pa, &sp_a, feats_a, wx, wy, wz);
                        let db = biome_density(seed, pb, &sp_b, feats_b, wx, wy, wz);
                        jmin(lerp(da, db, t), core_distance(pmix, &sp_mix, wx, wy))
                    };
                    full += 1;
                }
            }
        }
        full
    }
}
