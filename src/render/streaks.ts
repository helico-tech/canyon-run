// Speed streaks: short line segments in a tube around the camera, scrolled by the
// sim tick (not wall time) so headless frames stay deterministic (research 05 §1.4).
import * as THREE from 'three';
import type { RenderPose } from './camera.ts';

export const STREAK_COUNT = 300;
const TUBE_MIN = 6;
const TUBE_MAX = 25;
const Z_NEAR = -20;
const Z_FAR = 60;
const Z_RANGE = Z_FAR - Z_NEAR;

/** Hash-seeded layout: radius, angle (as cos/sin) and base z per streak. */
export function streakLayout(seed: number): Float32Array {
  const out = new Float32Array(STREAK_COUNT * 4);
  let h = (seed ^ 0x9e3779b9) >>> 0;
  const next = (): number => {
    h ^= h << 13;
    h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5;
    h >>>= 0;
    return h / 4294967296;
  };
  for (let i = 0; i < STREAK_COUNT; i++) {
    const r = TUBE_MIN + (TUBE_MAX - TUBE_MIN) * Math.sqrt(next());
    const a = next() * Math.PI * 2;
    out[i * 4] = r * Math.cos(a);
    out[i * 4 + 1] = r * Math.sin(a);
    out[i * 4 + 2] = Z_NEAR + next() * Z_RANGE;
    out[i * 4 + 3] = 0.6 + next() * 0.8; // length factor
  }
  return out;
}

/** z position of a streak whose base is `base`, after `travel` units of flight; wraps in the tube. */
export function streakZ(base: number, travel: number): number {
  const z = base - travel;
  const wrapped = z - Z_RANGE * Math.floor((z - Z_NEAR) / Z_RANGE);
  return wrapped;
}

export class Streaks {
  readonly lines: THREE.LineSegments;
  private readonly layout: Float32Array;
  private readonly positions: Float32Array;
  private readonly material: THREE.LineBasicMaterial;
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();

  constructor(seed: number) {
    this.layout = streakLayout(seed);
    this.positions = new Float32Array(STREAK_COUNT * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.lines = new THREE.LineSegments(geo, this.material);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 10;
  }

  setColour(r: number, g: number, b: number): void {
    // 40 % accent, 60 % white (research 05).
    this.material.color.setRGB(0.6 + 0.4 * r, 0.6 + 0.4 * g, 0.6 + 0.4 * b);
  }

  /** Rebuilds the segments around the camera for this frame. */
  update(pose: RenderPose, cameraQuat: THREE.Quaternion, travel: number, speed: number): void {
    const tV = Math.min(Math.max(pose.tV, 0), 1.2);
    this.material.opacity = 0.45 * tV * tV;
    this.lines.visible = tV > 0.2;
    if (!this.lines.visible) return;
    const len = 0.15 * speed;
    this.q.copy(cameraQuat);
    const p = this.positions;
    for (let i = 0; i < STREAK_COUNT; i++) {
      const lx = this.layout[i * 4]!;
      const ly = this.layout[i * 4 + 1]!;
      const z = streakZ(this.layout[i * 4 + 2]!, travel);
      const l = len * this.layout[i * 4 + 3]!;
      // Camera space: forward is -Z.
      this.v.set(lx, ly, -z).applyQuaternion(this.q);
      const o = i * 6;
      p[o] = pose.x + this.v.x;
      p[o + 1] = pose.y + this.v.y;
      p[o + 2] = pose.z + this.v.z;
      this.v.set(lx, ly, -z + l).applyQuaternion(this.q);
      p[o + 3] = pose.x + this.v.x;
      p[o + 4] = pose.y + this.v.y;
      p[o + 5] = pose.z + this.v.z;
    }
    (this.lines.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}
