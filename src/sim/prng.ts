// Integer-only seeded PRNGs (ADR 0002). All state is u32; every op is |0, >>>, ^, <<, Math.imul.

/** splitmix32: expands one u32 seed into a stream; used only to seed sfc32. */
export function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

/** sfc32 state: four u32 words, serialisable and hashable. */
export type Sfc32State = Uint32Array;

export function sfc32Seed(seed: number): Sfc32State {
  const sm = splitmix32(seed);
  const s = new Uint32Array(4);
  for (let i = 0; i < 4; i++) s[i] = sm();
  for (let i = 0; i < 12; i++) sfc32Next(s);
  return s;
}

export function sfc32Next(s: Sfc32State): number {
  const t = (((s[0]! + s[1]!) | 0) + s[3]!) | 0;
  s[3] = (s[3]! + 1) | 0;
  s[0] = s[1]! ^ (s[1]! >>> 9);
  s[1] = (s[2]! + (s[2]! << 3)) | 0;
  s[2] = (((s[2]! << 21) | (s[2]! >>> 11)) + t) | 0;
  return t >>> 0;
}

/** u32 to [0, 1): exact division by a power of two. */
export function u32ToUnit(u: number): number {
  return u / 4294967296;
}

export function sfc32NextUnit(s: Sfc32State): number {
  return u32ToUnit(sfc32Next(s));
}
