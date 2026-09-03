// Adversary rendering (ADR 0007 §6): instanced bodies per shape, unlit telegraph
// station frames on the walls, all posed by the sim's own closed-form
// motion at the interpolated time so bodies sit exactly where the sim had them.
import * as THREE from 'three';
import {
  advPoseAt,
  createPose,
  MOTION_CLOSE,
  phase01,
  SHAPE_BLADE,
  SHAPE_BOX,
  SHAPE_RING,
  SHAPE_WEDGE,
  swing,
} from '../sim/adversaries.ts';
import type { AdversaryScratch, Station } from '../sim/adversaries.ts';
import { spineAt } from '../terrain/field.ts';
import { createSpine } from '../terrain/spine.ts';
import type { Rgb } from '../terrain/palette.ts';

const CAPACITY = 64;
const FRAME_CAPACITY = 32 * 3;

function wedgeGeometry(): THREE.BufferGeometry {
  // Isosceles prism: half base 1 (x), height 2 (y from -1 to 1), depth 2 (z).
  const v = [
    [-1, -1, -1],
    [1, -1, -1],
    [0, 1, -1],
    [-1, -1, 1],
    [1, -1, 1],
    [0, 1, 1],
  ];
  const faces = [
    [0, 1, 2],
    [3, 5, 4], // ends
    [0, 3, 4, 0, 4, 1], // base
    [1, 4, 5, 1, 5, 2], // right slope
    [0, 2, 5, 0, 5, 3], // left slope
  ];
  const pos: number[] = [];
  for (const f of faces) for (const i of f) pos.push(...v[i]!);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.computeVertexNormals();
  return geo;
}

interface Layer {
  bodies: THREE.InstancedMesh;
}

export class AdversaryLayer {
  readonly group = new THREE.Group();
  private readonly layers: Layer[] = [];
  private readonly frames: THREE.InstancedMesh;
  private readonly pose = createPose();
  private readonly m = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly sc = new THREE.Vector3();
  private readonly colour = new THREE.Color();
  private readonly spine = createSpine();
  // Unlit so bodies read at any distance in any biome: "draw what kills" in the accent colour.
  private readonly bodyMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private readonly frameMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.85,
  });

  constructor() {
    const geos = [
      new THREE.BoxGeometry(2, 2, 2),
      wedgeGeometry(),
      new THREE.TorusGeometry(1, 0.16, 4, 16),
      new THREE.BoxGeometry(2, 2, 2),
    ];
    for (const geo of geos) {
      const bodies = new THREE.InstancedMesh(geo, this.bodyMat, CAPACITY);
      bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      bodies.frustumCulled = false;
      bodies.count = 0;
      this.group.add(bodies);
      this.layers.push({ bodies });
    }
    this.frames = new THREE.InstancedMesh(
      new THREE.BoxGeometry(2, 2, 2),
      this.frameMat,
      FRAME_CAPACITY,
    );
    this.frames.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.frames.frustumCulled = false;
    this.frames.count = 0;
    this.group.add(this.frames);
  }

  private place(
    mesh: THREE.InstancedMesh,
    i: number,
    st: Station,
    x: number,
    y: number,
    c: number,
    s: number,
    scale: number,
    colour: THREE.Color,
  ): void {
    this.p.set(x, y, st.z);
    const angle = Math.atan2(s, c);
    this.q.set(0, 0, Math.sin(angle / 2), Math.cos(angle / 2));
    if (st.shape === SHAPE_RING) this.sc.set(this.pose.radius * scale, this.pose.radius * scale, 1);
    else this.sc.set(st.len * scale, st.r * scale, st.hz);
    this.m.compose(this.p, this.q, this.sc);
    mesh.setMatrixAt(i, this.m);
    mesh.setColorAt(i, colour);
  }

  /** Writes this frame's instances from the sim's active stations. */
  update(
    seed: number,
    mode: number,
    adv: AdversaryScratch,
    time: number,
    planeZ: number,
    accent: Rgb | undefined,
  ): void {
    const counts = [0, 0, 0, 0];
    let frameCount = 0;
    const ar = (accent?.[0] ?? 255) / 255;
    const ag = (accent?.[1] ?? 255) / 255;
    const ab = (accent?.[2] ?? 255) / 255;
    for (let i = 0; i < adv.count; i++) {
      const st = adv.stations[i]!;
      if (st.z < planeZ - 40 || st.z > planeZ + 720) continue;
      advPoseAt(st, time, planeZ, this.pose);
      const layer = this.layers[st.shape]!;
      const shapeIndex =
        st.shape === SHAPE_BOX
          ? 0
          : st.shape === SHAPE_WEDGE
            ? 1
            : st.shape === SHAPE_RING
              ? 2
              : SHAPE_BLADE;
      const pulse = 0.5 + 0.5 * swing(phase01(time, st.period, st.phase));
      const bodies = st.motion === MOTION_CLOSE ? 2 : 1;
      for (let b = 0; b < bodies; b++) {
        if (counts[shapeIndex]! >= CAPACITY) break;
        const x =
          st.motion === MOTION_CLOSE
            ? st.cx + (b === 0 ? 1 : -1) * (this.pose.gap + st.len)
            : this.pose.x;
        const y = this.pose.y;
        // Telegraph: the body breathes from the accent toward white over its period.
        const k = 0.35 * pulse;
        this.colour.setRGB(ar + (1 - ar) * k, ag + (1 - ag) * k, ab + (1 - ab) * k);
        this.place(
          layer.bodies,
          counts[shapeIndex]!,
          st,
          x,
          y,
          this.pose.c,
          this.pose.s,
          1,
          this.colour,
        );
        counts[shapeIndex]!++;
      }
      // Station frame: two posts and a lintel on the walls, fading in from 400 u.
      if (frameCount + 3 <= FRAME_CAPACITY) {
        spineAt(seed, st.z, this.spine, mode);
        const dz = st.z - planeZ;
        const t = dz < 60 ? 1 : dz > 400 ? 0 : 1 - (dz - 60) / 340;
        const bright = t * t;
        this.colour.setRGB(ar * bright, ag * bright, ab * bright);
        const sp = this.spine;
        const top = sp.ceilY - 16;
        const postH = (top - sp.floorY) * 0.5;
        this.q.set(0, 0, 0, 1);
        for (const side of [-1, 1]) {
          this.p.set(sp.cx + side * sp.hw * 0.98, sp.floorY + postH, st.z);
          this.sc.set(1, postH, 1);
          this.m.compose(this.p, this.q, this.sc);
          this.frames.setMatrixAt(frameCount, this.m);
          this.frames.setColorAt(frameCount, this.colour);
          frameCount++;
        }
        this.p.set(sp.cx, top, st.z);
        this.sc.set(sp.hw, 1, 1);
        this.m.compose(this.p, this.q, this.sc);
        this.frames.setMatrixAt(frameCount, this.m);
        this.frames.setColorAt(frameCount, this.colour);
        frameCount++;
      }
    }
    for (let k = 0; k < 4; k++) {
      const layer = this.layers[k]!;
      layer.bodies.count = counts[k]!;
      layer.bodies.instanceMatrix.needsUpdate = true;
      if (layer.bodies.instanceColor) layer.bodies.instanceColor.needsUpdate = true;
    }
    this.frames.count = frameCount;
    this.frames.instanceMatrix.needsUpdate = true;
    if (this.frames.instanceColor) this.frames.instanceColor.needsUpdate = true;
  }
}
