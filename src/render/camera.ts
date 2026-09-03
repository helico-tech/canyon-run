import * as THREE from 'three';
import { C } from '../sim/constants.ts';

export interface RenderPose {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  /** Speed factor in [0, 1.2]: widens the field of view. */
  tV: number;
  /** Filtered body rates (rad/s) for the camera lean. */
  rollRate: number;
  pitchRate: number;
  yawRate: number;
  /** [0, 1] proximity to rock: drives the shake. */
  proximity: number;
  /** Sim tick plus interpolation, for deterministic noise. */
  time: number;
  /** Speed in u/s. */
  speed: number;
  /** Seconds since death (0 while alive). */
  deadFor: number;
}

export const FOV_BASE = 66;
export const FOV_SPEED = 18;

/** The sim's body frame (forward +Z, right −X) is the three.js camera frame yawed 180°. */
const YAW_180 = new THREE.Quaternion(0, 1, 0, 0);
const tmp = new THREE.Quaternion();
const leanQ = new THREE.Quaternion();
const euler = new THREE.Euler();

/** Lean per unit of body rate (rad per rad/s): roll 3°, pitch 2°, yaw 2° at full command. */
const LEAN_ROLL = 0.0524 / C.ROLL_RATE;
const LEAN_PITCH = 0.0349 / C.PITCH_RATE;
const LEAN_YAW = 0.0349 / C.YAW_RATE;
const SHAKE_MAX = 0.0262; // 1.5°

/** Deterministic smooth noise in [-1, 1] from a time value (28 Hz lattice, quintic fade). */
export function shakeNoise(t: number, salt: number): number {
  const x = t * 28;
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  const h = (k: number): number => {
    let v = Math.imul(k ^ salt, 0x9e3779b1) >>> 0;
    v ^= v >>> 15;
    v = Math.imul(v, 0x85ebca6b) >>> 0;
    v ^= v >>> 13;
    return (v >>> 8) / 8388608 - 1;
  };
  return h(i) + (h(i + 1) - h(i)) * u;
}

export function applyPose(camera: THREE.PerspectiveCamera, pose: RenderPose): void {
  camera.position.set(pose.x, pose.y, pose.z);
  tmp.set(pose.qx, pose.qy, pose.qz, pose.qw);
  tmp.multiply(YAW_180);
  // Lean with the commanded rates (rigid aim, a little weight) plus proximity shake.
  const prox = Math.min(Math.max(pose.proximity, 0), 1);
  const shake = Math.min(SHAKE_MAX, 0.00436 * prox * prox + 0.00087 * pose.tV * pose.tV);
  const t = pose.time / 60;
  euler.set(
    pose.pitchRate * LEAN_PITCH + shake * shakeNoise(t, 11),
    -pose.yawRate * LEAN_YAW + shake * shakeNoise(t, 23),
    -pose.rollRate * LEAN_ROLL + shake * shakeNoise(t, 37),
    'YXZ',
  );
  leanQ.setFromEuler(euler);
  camera.quaternion.copy(tmp.multiply(leanQ));
  const fov = FOV_BASE + FOV_SPEED * Math.min(Math.max(pose.tV, 0), 1.2);
  if (camera.fov !== fov) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}
