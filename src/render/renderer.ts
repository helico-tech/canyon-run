// three.js adapter (ADR 0001). Owns the scene, chunk meshes, sky, fog, lights and camera.
import * as THREE from 'three';
import type { ChunkMesh } from '../terrain/chunk.ts';
import type { Atmosphere } from './atmosphere.ts';
import { rgbToFloat } from './atmosphere.ts';
import type { RenderPose } from './camera.ts';
import { applyPose } from './camera.ts';
import { chunkId, createTerrainMaterial, disposeMesh, toThreeMesh } from './chunkMesh.ts';
import { Sky } from './sky.ts';
import { Streaks } from './streaks.ts';
import { Shards } from './shards.ts';
import { AdversaryLayer } from './adversaries.ts';
import type { Aim } from '../sim/adversaries.ts';
import type { AdversaryScratch } from '../sim/adversaries.ts';
import type { Rgb } from '../terrain/palette.ts';

export interface RendererOptions {
  width: number;
  height: number;
  preserveDrawingBuffer?: boolean;
  pixelRatio?: number;
}

/** What the game and the world need from a renderer (three.js or a null stand-in). */
export interface GameRenderer {
  readonly info: { renderer: string; vendor: string; version: string };
  setSeed(seed: number): void;
  setAtmosphere(a: Atmosphere): void;
  spawnShards(
    seed: number,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    accent: [number, number, number],
  ): void;
  clearShards(): void;
  setAdversaries(
    seed: number,
    mode: number,
    adv: AdversaryScratch,
    time: number,
    planeZ: number,
    accent: Rgb | undefined,
    aim: Aim,
  ): void;
  addChunk(chunk: ChunkMesh): void;
  evictBelow(minCz: number): number;
  readonly chunkCount: number;
  triangleCount(): number;
  resize(width: number, height: number): void;
  render(pose: RenderPose): void;
  readPixel(x: number, y: number): [number, number, number, number];
  frameHash(): number;
  dispose(): void;
}

export class Renderer implements GameRenderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly info: { renderer: string; vendor: string; version: string };
  private readonly sky = new Sky();
  private streaks: Streaks | null = null;
  private readonly shards = new Shards();
  private readonly adversaries = new AdversaryLayer();
  private travel = 0;
  private lastTime = Number.NaN;
  private readonly sun = new THREE.DirectionalLight(0xffffff, 2);
  private readonly hemi = new THREE.HemisphereLight(0xffffff, 0x808080, 1);
  private readonly fog = new THREE.FogExp2(0xff9a5c, 0.004);
  private readonly background = new THREE.Color(0xff9a5c);
  private readonly material = createTerrainMaterial();
  private readonly chunks = new Map<string, THREE.Mesh>();
  private readonly pixel = new Uint8Array(4);
  private width: number;
  private height: number;

  constructor(canvas: HTMLCanvasElement, opts: RendererOptions) {
    THREE.ColorManagement.enabled = false;
    this.gl = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
      powerPreference: 'high-performance',
    });
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.gl.setPixelRatio(opts.pixelRatio ?? 1);
    this.width = opts.width;
    this.height = opts.height;
    this.gl.setSize(opts.width, opts.height, false);
    this.camera = new THREE.PerspectiveCamera(66, opts.width / opts.height, 0.5, 800);
    this.scene.fog = this.fog;
    this.scene.add(this.sky.mesh, this.sun, this.hemi, this.shards.mesh, this.adversaries.group);
    const ctx = this.gl.getContext();
    const dbg = ctx.getExtension('WEBGL_debug_renderer_info');
    this.info = {
      renderer: dbg
        ? String(ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
        : String(ctx.getParameter(ctx.RENDERER)),
      vendor: dbg
        ? String(ctx.getParameter(dbg.UNMASKED_VENDOR_WEBGL))
        : String(ctx.getParameter(ctx.VENDOR)),
      version: String(ctx.getParameter(ctx.VERSION)),
    };
  }

  spawnShards(
    seed: number,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    accent: [number, number, number],
  ): void {
    this.shards.spawn(seed, x, y, z, vx, vy, vz, accent);
  }

  clearShards(): void {
    this.shards.clear();
  }

  setAdversaries(
    seed: number,
    mode: number,
    adv: AdversaryScratch,
    time: number,
    planeZ: number,
    accent: Rgb | undefined,
    aim: Aim,
  ): void {
    this.adversaries.update(seed, mode, adv, time, planeZ, accent, aim);
  }

  /** Installs the speed streaks for a seed (layout is seeded so frames stay deterministic). */
  setSeed(seed: number): void {
    if (this.streaks) this.scene.remove(this.streaks.lines);
    this.streaks = new Streaks(seed);
    this.scene.add(this.streaks.lines);
    this.travel = 0;
    this.lastTime = Number.NaN;
  }

  setAtmosphere(a: Atmosphere): void {
    this.sky.apply(a);
    if (this.streaks && a.accent)
      this.streaks.setColour(a.accent[0] / 255, a.accent[1] / 255, a.accent[2] / 255);
    const [hr, hg, hb] = rgbToFloat(a.horizon);
    this.fog.color.setRGB(hr, hg, hb);
    this.fog.density = a.fogDensity;
    this.background.setRGB(hr, hg, hb);
    this.scene.background = this.background;
    const [sr, sg, sb] = rgbToFloat(a.sun);
    this.sun.color.setRGB(sr, sg, sb);
    this.sun.intensity = a.sunIntensity;
    this.sun.position.set(a.sunDir[0], a.sunDir[1], a.sunDir[2]);
    const [ar, ag, ab] = rgbToFloat(a.ambient);
    this.hemi.color.setRGB(ar, ag, ab);
    const [gr, gg, gb] = rgbToFloat(a.ground);
    this.hemi.groundColor.setRGB(gr, gg, gb);
    this.hemi.intensity = a.hemiIntensity;
  }

  addChunk(chunk: ChunkMesh): void {
    const id = chunkId(chunk.cx, chunk.cy, chunk.cz);
    if (this.chunks.has(id)) return;
    const mesh = toThreeMesh(chunk, this.material);
    this.chunks.set(id, mesh);
    this.scene.add(mesh);
  }

  /** Removes every chunk whose slab is below `minCz`. */
  evictBelow(minCz: number): number {
    let n = 0;
    for (const [id, mesh] of this.chunks) {
      const cz = Number(id.split(',')[2]);
      if (cz < minCz) {
        this.scene.remove(mesh);
        disposeMesh(mesh);
        this.chunks.delete(id);
        n++;
      }
    }
    return n;
  }

  get chunkCount(): number {
    return this.chunks.size;
  }

  triangleCount(): number {
    let n = 0;
    for (const m of this.chunks.values()) n += m.geometry.getAttribute('position').count / 3;
    return n;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.gl.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  render(pose: RenderPose): void {
    applyPose(this.camera, pose);
    this.sky.follow(pose.x, pose.y, pose.z);
    if (this.streaks) {
      // Travel advances with sim time so the same replay always draws the same streaks.
      const dt = Number.isNaN(this.lastTime) ? 0 : Math.max(0, pose.time - this.lastTime) / 60;
      this.lastTime = pose.time;
      this.travel += pose.speed * dt;
      this.streaks.update(
        pose,
        this.camera.quaternion,
        this.travel,
        pose.deadFor > 0 ? 0 : pose.speed,
      );
    }
    this.shards.update(pose.deadFor);
    this.gl.render(this.scene, this.camera);
  }

  /** Reads one pixel (x right, y down, in canvas pixels). */
  readPixel(x: number, y: number): [number, number, number, number] {
    const ctx = this.gl.getContext();
    ctx.readPixels(x, this.height - 1 - y, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, this.pixel);
    return [this.pixel[0]!, this.pixel[1]!, this.pixel[2]!, this.pixel[3]!];
  }

  /** FNV-1a over the whole RGBA frame buffer. */
  frameHash(): number {
    const ctx = this.gl.getContext();
    const buf = new Uint8Array(this.width * this.height * 4);
    ctx.readPixels(0, 0, this.width, this.height, ctx.RGBA, ctx.UNSIGNED_BYTE, buf);
    let h = 0x811c9dc5;
    for (let i = 0; i < buf.length; i++) {
      h ^= buf[i]!;
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  dispose(): void {
    for (const m of this.chunks.values()) disposeMesh(m);
    this.chunks.clear();
    this.material.dispose();
    this.gl.dispose();
  }
}
