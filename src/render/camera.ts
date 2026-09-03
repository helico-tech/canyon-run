import * as THREE from 'three';

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
}

export const FOV_BASE = 66;
export const FOV_SPEED = 18;

/** The sim's body frame (forward +Z, right −X) is the three.js camera frame yawed 180°. */
const YAW_180 = new THREE.Quaternion(0, 1, 0, 0);
const tmp = new THREE.Quaternion();

export function applyPose(camera: THREE.PerspectiveCamera, pose: RenderPose): void {
  camera.position.set(pose.x, pose.y, pose.z);
  tmp.set(pose.qx, pose.qy, pose.qz, pose.qw);
  camera.quaternion.copy(tmp.multiply(YAW_180));
  const fov = FOV_BASE + FOV_SPEED * Math.min(Math.max(pose.tV, 0), 1.2);
  if (camera.fov !== fov) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}
