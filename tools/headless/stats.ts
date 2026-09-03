// Cheap semantic statistics of a frame (ADR 0003). Works on PNG files or raw RGBA.
import fs from 'node:fs';
import { PNG } from 'pngjs';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface FrameStats {
  size: [number, number];
  meanLum: number;
  uniqueColours16: number;
  edgeDensityPct: number;
  /** Fraction of pixels close to the fog colour, whole frame and top/bottom bands. */
  fogFraction: number;
  fogFractionTop: number;
  fogFractionBottom: number;
  dominant: Array<{ rgb: [number, number, number]; pct: number }>;
  grid3x3: Array<[number, number, number]>;
}

export function readPng(file: string): { width: number; height: number; data: Uint8Array } {
  const png = PNG.sync.read(fs.readFileSync(file));
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}

export function frameStats(
  { width: W, height: H, data }: { width: number; height: number; data: Uint8Array },
  fog: Rgb,
  fogTol = 28,
): FrameStats {
  const px = (x: number, y: number): [number, number, number] => {
    const i = (y * W + x) * 4;
    return [data[i]!, data[i + 1]!, data[i + 2]!];
  };
  const lum = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const nearFog = (r: number, g: number, b: number): boolean =>
    Math.abs(r - fog.r) <= fogTol && Math.abs(g - fog.g) <= fogTol && Math.abs(b - fog.b) <= fogTol;
  const quant = new Map<number, number>();
  let lsum = 0;
  let edges = 0;
  let fogAll = 0;
  let fogTop = 0;
  let fogBottom = 0;
  const band = Math.floor(H / 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = px(x, y);
      lsum += lum(r, g, b);
      const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      quant.set(k, (quant.get(k) ?? 0) + 1);
      if (nearFog(r, g, b)) {
        fogAll++;
        if (y < band) fogTop++;
        if (y >= H - band) fogBottom++;
      }
      if (x + 1 < W && y + 1 < H) {
        const [r2, g2, b2] = px(x + 1, y);
        const [r3, g3, b3] = px(x, y + 1);
        const l = lum(r, g, b);
        if (Math.abs(l - lum(r2, g2, b2)) > 24 || Math.abs(l - lum(r3, g3, b3)) > 24) edges++;
      }
    }
  }
  const dominant = [...quant.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, n]) => ({
      rgb: [((k >> 8) & 15) * 17, ((k >> 4) & 15) * 17, (k & 15) * 17] as [number, number, number],
      pct: +((100 * n) / (W * H)).toFixed(1),
    }));
  const grid: Array<[number, number, number]> = [];
  for (let gy = 0; gy < 3; gy++) {
    for (let gx = 0; gx < 3; gx++) {
      let s0 = 0;
      let s1 = 0;
      let s2 = 0;
      let n = 0;
      for (let y = Math.floor((gy * H) / 3); y < Math.floor(((gy + 1) * H) / 3); y += 2) {
        for (let x = Math.floor((gx * W) / 3); x < Math.floor(((gx + 1) * W) / 3); x += 2) {
          const p = px(x, y);
          s0 += p[0];
          s1 += p[1];
          s2 += p[2];
          n++;
        }
      }
      grid.push([Math.round(s0 / n), Math.round(s1 / n), Math.round(s2 / n)]);
    }
  }
  return {
    size: [W, H],
    meanLum: +(lsum / (W * H)).toFixed(1),
    uniqueColours16: quant.size,
    edgeDensityPct: +((100 * edges) / (W * H)).toFixed(2),
    fogFraction: +(fogAll / (W * H)).toFixed(4),
    fogFractionTop: +(fogTop / (W * band)).toFixed(4),
    fogFractionBottom: +(fogBottom / (W * band)).toFixed(4),
    dominant,
    grid3x3: grid,
  };
}

if (import.meta.main) {
  const [file, r, g, b] = process.argv.slice(2);
  if (!file) {
    console.error('usage: node tools/headless/stats.ts frame.png [fogR fogG fogB]');
    process.exit(2);
  }
  const fog = { r: Number(r ?? 255), g: Number(g ?? 154), b: Number(b ?? 92) };
  console.log(JSON.stringify(frameStats(readPng(file), fog)));
}
