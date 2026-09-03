// Unit quaternion helpers with no trigonometry. Body frame at identity:
// forward +Z, up +Y, right -X (spec §4).

/** Rotates v by q: v + 2w(q×v) + 2(q×(q×v)). Writes into out[o..o+2]. */
export function rotate(
  qx: number,
  qy: number,
  qz: number,
  qw: number,
  vx: number,
  vy: number,
  vz: number,
  out: Float64Array,
  o = 0,
): void {
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  out[o] = vx + qw * tx + (qy * tz - qz * ty);
  out[o + 1] = vy + qw * ty + (qz * tx - qx * tz);
  out[o + 2] = vz + qw * tz + (qx * ty - qy * tx);
}

/** Basis vectors: out[0..2] = right, out[3..5] = up, out[6..8] = forward. */
export function basis(qx: number, qy: number, qz: number, qw: number, out: Float64Array): void {
  rotate(qx, qy, qz, qw, -1, 0, 0, out, 0);
  rotate(qx, qy, qz, qw, 0, 1, 0, out, 3);
  rotate(qx, qy, qz, qw, 0, 0, 1, out, 6);
}

/**
 * First-order body-rate update: q ← normalize(q + q ⊗ (h, 0)) with h = 0.5·dt·ω.
 * Writes the new quaternion into out[0..3].
 */
export function integrate(
  qx: number,
  qy: number,
  qz: number,
  qw: number,
  hx: number,
  hy: number,
  hz: number,
  out: Float64Array,
): void {
  const nx = qx + (qw * hx + qy * hz - qz * hy);
  const ny = qy + (qw * hy - qx * hz + qz * hx);
  const nz = qz + (qw * hz + qx * hy - qy * hx);
  const nw = qw - (qx * hx + qy * hy + qz * hz);
  const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw);
  out[0] = nx * inv;
  out[1] = ny * inv;
  out[2] = nz * inv;
  out[3] = nw * inv;
}
