// Death shards: 48 flat triangles thrown from the crash point, driven by seconds
// since death (sim ticks, so headless frames are deterministic).
import * as THREE from 'three';

export const SHARD_COUNT = 48;
export const SHARD_LIFE = 1.2;
const GRAVITY = 20;

export interface ShardSpec {
  vx: number;
  vy: number;
  vz: number;
  ax: number;
  ay: number;
  az: number;
  spin: number;
  size: number;
  tint: number;
}

function rnd(seed: number, i: number, salt: number): number {
  let h = Math.imul(seed ^ (i * 0x9e3779b1) ^ salt, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return (h >>> 8) / 16777216;
}

/** Velocities and spins for the burst: plane velocity plus 10–40 u/s in a hashed direction. */
export function shardSpecs(seed: number, vx: number, vy: number, vz: number): ShardSpec[] {
  const out: ShardSpec[] = [];
  for (let i = 0; i < SHARD_COUNT; i++) {
    const u = rnd(seed, i, 1) * 2 - 1;
    const phi = rnd(seed, i, 2) * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const speed = 10 + 30 * rnd(seed, i, 3);
    out.push({
      vx: vx + s * Math.cos(phi) * speed,
      vy: vy + u * speed,
      vz: vz + s * Math.sin(phi) * speed,
      ax: rnd(seed, i, 4) * 2 - 1,
      ay: rnd(seed, i, 5) * 2 - 1,
      az: rnd(seed, i, 6) * 2 - 1,
      spin: 4 + 8 * rnd(seed, i, 7),
      size: 0.3 + 0.9 * rnd(seed, i, 8),
      tint: rnd(seed, i, 9),
    });
  }
  return out;
}

/** Position of a shard after t seconds (ballistic with gravity). */
export function shardPosition(spec: ShardSpec, t: number): [number, number, number] {
  return [spec.vx * t, spec.vy * t - 0.5 * GRAVITY * t * t, spec.vz * t];
}

export class Shards {
  readonly mesh: THREE.InstancedMesh;
  private specs: ShardSpec[] = [];
  private origin = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly axis = new THREE.Vector3();
  private readonly pos = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly colour = new THREE.Color();

  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-1, -0.6, 0, 1, -0.6, 0, 0, 1, 0]), 3),
    );
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, flatShading: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, SHARD_COUNT);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  spawn(
    seed: number,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    accent: [number, number, number],
  ): void {
    this.specs = shardSpecs(seed, vx, vy, vz);
    this.origin.set(x, y, z);
    for (let i = 0; i < SHARD_COUNT; i++) {
      const t = this.specs[i]!.tint;
      // Plane colour (light grey) mixed with the biome accent.
      this.colour.setRGB(
        0.85 + (accent[0] - 0.85) * t,
        0.85 + (accent[1] - 0.85) * t,
        0.9 + (accent[2] - 0.9) * t,
      );
      this.mesh.setColorAt(i, this.colour);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.visible = true;
    this.update(0);
  }

  /** t = seconds since death; hides itself after SHARD_LIFE. */
  update(t: number): void {
    if (!this.mesh.visible) return;
    if (t > SHARD_LIFE) {
      this.mesh.visible = false;
      return;
    }
    const fade = 1 - t / SHARD_LIFE;
    for (let i = 0; i < SHARD_COUNT; i++) {
      const sp = this.specs[i]!;
      const [px, py, pz] = shardPosition(sp, t);
      this.pos.set(this.origin.x + px, this.origin.y + py, this.origin.z + pz);
      this.axis.set(sp.ax, sp.ay, sp.az).normalize();
      this.q.setFromAxisAngle(this.axis, sp.spin * t);
      const s = sp.size * (0.4 + 0.6 * fade);
      this.scale.set(s, s, s);
      this.m.compose(this.pos, this.q, this.scale);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.mesh.visible = false;
  }
}
