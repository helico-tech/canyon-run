// Seed codec: u32 <-> "XXXX-XXXX" hex, URL hash, and a random seed source.

export function formatSeed(seed: number): string {
  const hex = (seed >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
}

/** Accepts "XXXX-XXXX", plain hex up to 8 digits, or a decimal number. */
export function parseSeed(text: string): number | null {
  const t = text.trim().replace(/-/g, '');
  if (t === '') return null;
  if (/^\d{1,10}$/.test(t)) {
    const n = Number(t);
    return n <= 0xffffffff ? n >>> 0 : null;
  }
  if (/^[0-9a-f]{1,8}$/i.test(t)) return parseInt(t, 16) >>> 0;
  return null;
}

export function seedFromHash(hash: string): number | null {
  const m = /seed=([^&]+)/.exec(hash);
  return m ? parseSeed(decodeURIComponent(m[1]!)) : null;
}

export function hashForSeed(seed: number): string {
  return `#seed=${formatSeed(seed)}`;
}

export function randomSeed(random: () => number = Math.random): number {
  return Math.floor(random() * 0x100000000) >>> 0 || 1;
}
