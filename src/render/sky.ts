import * as THREE from 'three';
import type { Atmosphere } from './atmosphere.ts';
import { rgbToFloat } from './atmosphere.ts';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform float uStars;
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
// Hashed starfield: one cell per ~1.2 degrees, a star in ~8 % of cells.
float stars(vec3 d) {
  vec3 cell = floor(d * 48.0);
  float h = hash13(cell);
  if (h < 0.92) return 0.0;
  vec3 centre = normalize((cell + 0.5 + vec3(hash13(cell + 1.0), hash13(cell + 2.0), hash13(cell + 3.0)) * 0.6 - 0.3) / 48.0);
  float dist = length(d - centre);
  float size = 0.004 + 0.006 * hash13(cell + 7.0);
  return smoothstep(size, 0.0, dist) * (0.5 + 0.5 * hash13(cell + 9.0));
}
float bayer4(vec2 p) {
  vec2 q = floor(mod(p, 4.0));
  int idx = int(q.x + 4.0 * q.y);
  const float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  float v = 0.0;
  for (int k = 0; k < 16; k++) { if (k == idx) v = m[k]; }
  return v / 16.0;
}
void main() {
  vec3 d = normalize(vDir);
  float t = smoothstep(-0.05, 0.45, d.y);
  vec3 col = mix(uHorizon, uZenith, t);
  float c = dot(d, uSunDir);
  float disc = smoothstep(0.9985, 0.9995, c);
  float halo = pow(max(c, 0.0), 64.0) * 0.35;
  col = mix(col, uSun, disc) + uSun * halo;
  if (uStars > 0.0) col += uStars * stars(d) * (1.0 - t * 0.2);
  col += (bayer4(gl_FragCoord.xy) - 0.5) / 48.0;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  readonly mesh: THREE.Mesh;
  private readonly uniforms: {
    uHorizon: THREE.IUniform<THREE.Vector3>;
    uZenith: THREE.IUniform<THREE.Vector3>;
    uSun: THREE.IUniform<THREE.Vector3>;
    uSunDir: THREE.IUniform<THREE.Vector3>;
    uStars: THREE.IUniform<number>;
  };

  constructor() {
    this.uniforms = {
      uHorizon: { value: new THREE.Vector3(1, 0.6, 0.36) },
      uZenith: { value: new THREE.Vector3(0.18, 0.1, 0.3) },
      uSun: { value: new THREE.Vector3(1, 0.9, 0.66) },
      uSunDir: { value: new THREE.Vector3(0.5, 0.57, 0.65) },
      uStars: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), mat);
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
  }

  apply(a: Atmosphere): void {
    this.uniforms.uHorizon.value.set(...rgbToFloat(a.horizon));
    this.uniforms.uZenith.value.set(...rgbToFloat(a.zenith));
    this.uniforms.uSun.value.set(...rgbToFloat(a.sun));
    this.uniforms.uSunDir.value.set(a.sunDir[0], a.sunDir[1], a.sunDir[2]).normalize();
    this.uniforms.uStars.value = a.stars ?? 0;
  }

  follow(x: number, y: number, z: number): void {
    this.mesh.position.set(x, y, z);
  }
}
