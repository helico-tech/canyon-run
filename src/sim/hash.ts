// FNV-1a 32 over bytes. State checksums hash the little-endian binary64 bits of
// each number, never its decimal string, so the hash is identical on any host.

export function fnv1a32(bytes: Uint8Array, h = 0x811c9dc5): number {
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** UTF-8 encode without TextEncoder so the core stays platform-free. */
export function utf8(str: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) {
      const lo = str.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo < 0xe000) {
        c = 0x10000 + ((c - 0xd800) << 10) + (lo - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    else
      out.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 0x3f),
        0x80 | ((c >> 6) & 0x3f),
        0x80 | (c & 0x3f),
      );
  }
  return Uint8Array.from(out);
}

export function fnv1a32String(str: string, h = 0x811c9dc5): number {
  return fnv1a32(utf8(str), h);
}

/** Hash a vector of doubles followed by a vector of u32s (explicit little-endian). */
export function hashF64sU32s(f64s: ArrayLike<number>, u32s: ArrayLike<number>): number {
  const buf = new ArrayBuffer(f64s.length * 8 + u32s.length * 4);
  const view = new DataView(buf);
  let o = 0;
  for (let i = 0; i < f64s.length; i++) {
    view.setFloat64(o, f64s[i]!, true);
    o += 8;
  }
  for (let i = 0; i < u32s.length; i++) {
    view.setUint32(o, u32s[i]! >>> 0, true);
    o += 4;
  }
  return fnv1a32(new Uint8Array(buf));
}

export function hex32(h: number): string {
  return (h >>> 0).toString(16).padStart(8, '0');
}
