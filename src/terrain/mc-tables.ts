// Marching-cubes tables, generated at load from a face-pairing rule and checked
// against Paul Bourke's edge table (research 03 §4.2). Corner order: 0 (0,0,0),
// 1 (1,0,0), 2 (1,1,0), 3 (0,1,0), 4–7 the same at z+1. Edges 0–3 ring z=0,
// 4–7 ring z=1, 8–11 vertical. The cube index bit i is set when corner i is ROCK
// (solid); the generated winding faces the air (the viewer).

export const CORNER: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
];
/** Edge endpoints in canonical +axis order. */
export const EDGE: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [3, 2],
  [0, 3],
  [4, 5],
  [5, 6],
  [7, 6],
  [4, 7],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];
const FACES: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [0, 1, 5, 4],
  [3, 2, 6, 7],
  [0, 3, 7, 4],
  [1, 2, 6, 5],
];

function edgeOf(a: number, b: number): number {
  return EDGE.findIndex(([p, q]) => (p === a && q === b) || (p === b && q === a));
}

export interface McTables {
  edgeTable: Int32Array;
  /** 256 × 16, edge indices terminated by -1. */
  triTable: Int8Array;
  /** Per case, the face segments (pairs of crossing edges) the triangulation must cover. */
  segsByCase: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
  maxTris: number;
}

export function buildTables(): McTables {
  const edgeTable = new Int32Array(256);
  const triTable = new Int8Array(256 * 16).fill(-1);
  const segsByCase: Array<Array<[number, number]>> = [];
  let maxTris = 0;
  for (let c = 0; c < 256; c++) {
    const solid = (i: number): number => (c >> i) & 1;
    let mask = 0;
    for (let e = 0; e < 12; e++) {
      const [p, q] = EDGE[e]!;
      if (solid(p) !== solid(q)) mask |= 1 << e;
    }
    edgeTable[c] = mask;
    const segs: Array<[number, number]> = [];
    for (const f of FACES) {
      const fe = [edgeOf(f[0], f[1]), edgeOf(f[1], f[2]), edgeOf(f[2], f[3]), edgeOf(f[3], f[0])];
      const s = f.map(solid);
      const cross = fe.filter((_, i) => s[i] !== s[(i + 1) % 4]);
      if (cross.length === 2) segs.push([cross[0]!, cross[1]!]);
      else if (cross.length === 4) {
        // Ambiguous face: solid corners on a diagonal. Keep them separated. The rule
        // depends only on the face's own pattern, so both cubes sharing it agree.
        if (s[0] === 1) segs.push([fe[3]!, fe[0]!], [fe[1]!, fe[2]!]);
        else segs.push([fe[0]!, fe[1]!], [fe[2]!, fe[3]!]);
      }
    }
    segsByCase.push(segs);
    const adj = new Map<number, number[]>();
    for (const [a, b] of segs) {
      if (!adj.has(a)) adj.set(a, []);
      if (!adj.has(b)) adj.set(b, []);
      adj.get(a)!.push(b);
      adj.get(b)!.push(a);
    }
    for (const [e, l] of adj)
      if (l.length !== 2) throw new Error(`case ${c}: edge ${e} degree ${l.length}`);
    const visited = new Set<number>();
    const tris: number[] = [];
    const mid = (e: number): number[] => {
      const [p, q] = EDGE[e]!;
      return [0, 1, 2].map((i) => (CORNER[p]![i]! + CORNER[q]![i]!) * 0.5);
    };
    const airOf = (e: number): number => (solid(EDGE[e]![0]) ? EDGE[e]![1] : EDGE[e]![0]);
    const solOf = (e: number): number => (solid(EDGE[e]![0]) ? EDGE[e]![0] : EDGE[e]![1]);
    for (const start of adj.keys()) {
      if (visited.has(start)) continue;
      const loop = [start];
      visited.add(start);
      let prev = -1;
      let cur = start;
      for (;;) {
        const [a, b] = adj.get(cur)! as [number, number];
        const nxt = a !== prev ? a : b;
        if (nxt === start) break;
        loop.push(nxt);
        visited.add(nxt);
        prev = cur;
        cur = nxt;
      }
      // Orient: for face segment A→B with outward face normal nf and m the in-face vector
      // from solid corners to air corners, the air-facing winding has dot(cross(B−A, m), nf) > 0.
      let agree = 0;
      let disagree = 0;
      for (let i = 0; i < loop.length; i++) {
        const ea = loop[i]!;
        const eb = loop[(i + 1) % loop.length]!;
        const f = FACES.find(
          (face) =>
            EDGE[ea]!.every((v) => face.includes(v)) && EDGE[eb]!.every((v) => face.includes(v)),
        )!;
        const axis = [0, 1, 2].find((ax) => f.every((v) => CORNER[v]![ax] === CORNER[f[0]]![ax]))!;
        const nf = [0, 0, 0];
        nf[axis] = CORNER[f[0]]![axis] === 1 ? 1 : -1;
        const A = mid(ea);
        const B = mid(eb);
        const m = [0, 1, 2].map(
          (i) =>
            CORNER[airOf(ea)]![i]! +
            CORNER[airOf(eb)]![i]! -
            CORNER[solOf(ea)]![i]! -
            CORNER[solOf(eb)]![i]!,
        );
        const d = [B[0]! - A[0]!, B[1]! - A[1]!, B[2]! - A[2]!];
        const cr = [
          d[1]! * m[2]! - d[2]! * m[1]!,
          d[2]! * m[0]! - d[0]! * m[2]!,
          d[0]! * m[1]! - d[1]! * m[0]!,
        ];
        const s = cr[0]! * nf[0]! + cr[1]! * nf[1]! + cr[2]! * nf[2]!;
        if (s > 0) agree++;
        else if (s < 0) disagree++;
        else throw new Error(`case ${c}: degenerate segment`);
      }
      if (agree && disagree) throw new Error(`case ${c}: inconsistent loop orientation`);
      if (disagree) loop.reverse();
      for (let i = 1; i + 1 < loop.length; i++) tris.push(loop[0]!, loop[i]!, loop[i + 1]!);
    }
    if (tris.length > 15) throw new Error(`case ${c}: ${tris.length / 3} triangles`);
    maxTris = Math.max(maxTris, tris.length / 3);
    for (let i = 0; i < tris.length; i++) triTable[c * 16 + i] = tris[i]!;
  }
  return { edgeTable, triTable, segsByCase, maxTris };
}

export const MC_TABLES: McTables = buildTables();
