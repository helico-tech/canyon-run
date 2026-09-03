// One screenshot after N ticks: node tools/headless/shot.ts --seed 1 --ticks 0 --out shot.png
import fs from 'node:fs';
import path from 'node:path';
import { openPage } from './browser.ts';
import { serveStatic } from './serve.ts';

function flags(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out[a.slice(2)] = next;
        i++;
      } else out[a.slice(2)] = 'true';
    }
  }
  return out;
}

const f = flags(process.argv.slice(2));
const seed = Number(f.seed ?? 1);
const ticks = Number(f.ticks ?? 0);
const width = Number(f.width ?? 640);
const height = Number(f.height ?? 360);
const out = f.out ?? 'shot.png';
const dist = path.resolve('dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('dist/ missing: run pnpm build first');
  process.exit(2);
}
const server = await serveStatic(dist);
const t0 = performance.now();
const {
  browser,
  page,
  console: log,
} = await openPage(`${server.url}/?test=1&seed=${seed}&w=${width}&h=${height}`, {
  width,
  height,
});
const snap = await page.evaluate((n) => window.__game!.step(n), ticks);
const info = await page.evaluate(() => window.__info);
const stats = await page.evaluate(() => window.__game!.chunkStats());
const hash = await page.evaluate(() => window.__game!.frameHash());
const probes = await page.evaluate(
  ([w, h]) => {
    const g = window.__game!;
    return {
      topCentre: g.readPixel(Math.floor(w / 2), 8),
      centre: g.readPixel(Math.floor(w / 2), Math.floor(h / 2)),
      bottomCentre: g.readPixel(Math.floor(w / 2), h - 8),
      left: g.readPixel(8, Math.floor(h / 2)),
      right: g.readPixel(w - 8, Math.floor(h / 2)),
    };
  },
  [width, height],
);
fs.mkdirSync(path.dirname(out), { recursive: true });
await page.screenshot({ path: out });
const ms = Math.round(performance.now() - t0);
console.log(
  JSON.stringify({ out, seed, ticks, snap, info, stats, hash, probes, console: log, ms }, null, 1),
);
await browser.close();
server.close();
