import * as THREE from 'three';
import type { ChunkMesh } from '../terrain/chunk.ts';
import { CHUNK_SIZE } from '../terrain/march.ts';

export function chunkId(cx: number, cy: number, cz: number): string {
  return `${cx},${cy},${cz}`;
}

export function createTerrainMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
}

/** Builds a three.js mesh for a chunk; positions stay chunk-local, the mesh carries the origin. */
export function toThreeMesh(chunk: ChunkMesh, material: THREE.Material): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(chunk.pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(chunk.rgba, 4, true));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(chunk.cx * CHUNK_SIZE, chunk.cy * CHUNK_SIZE, chunk.cz * CHUNK_SIZE);
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  mesh.name = chunkId(chunk.cx, chunk.cy, chunk.cz);
  return mesh;
}

export function disposeMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
}
