// Replay-driven headless run (ADR 0003):
//   node tools/headless/run.ts --seed 1 --frames 300 --every 30 --out runs/seed1 [--width 640 --height 360]
//   node tools/headless/run.ts --replay tests/replays/seed-1.json --frames 300 --every 30 --out runs/r1
// Writes frames.jsonl, frame-NNNN.png, stats.json, hashes.json, sheet.png, gate.json.
import fs from 'node:fs';
import path from 'node:path';
import { createPilot } from '../../src/sim/pilot.ts';
import { recordRun, simulateTicks } from '../../src/sim/replay.ts';
import type { Replay } from '../../src/sim/replay.ts';
import { checksum } from '../../src/sim/state.ts';
import { hex32 } from '../../src/sim/hash.ts';
import { parseArgs } from './args.ts';
import { parseBiomeMode } from '../../src/terrain/biomes.ts';
import { openPage } from './browser.ts';
import { runGates } from './gate.ts';
import type { FrameRecord, GateResult } from './gate.ts';
import { serveStatic } from './serve.ts';
import { contactSheet } from './sheet.ts';
import { frameStats, readPng } from './stats.ts';
import type { FrameStats } from './stats.ts';

export interface RunOptions {
  seed?: number;
  replay?: Replay;
  frames: number;
  every: number;
  width: number;
  height: number;
  out: string;
  dist?: string;
  /** Biome mode (0 auto); ignored when a replay is given. */
  biomeMode?: number;
  /** Ticks to simulate before the first rendered frame (fast: no per-tick render). */
  skip?: number;
}

export interface RunResult {
  rendererKey: string;
  renderer: string;
  frames: FrameRecord[];
  stats: Array<{ frame: number; stats: FrameStats }>;
  gates: GateResult[];
  ok: boolean;
  consoleErrors: string[];
  ms: number;
}

export function rendererKey(renderer: string): string {
  if (/SwiftShader/i.test(renderer)) return 'swiftshader';
  if (/llvmpipe/i.test(renderer)) return 'llvmpipe';
  return renderer
    .replace(/[^a-z0-9]+/gi, '-')
    .slice(0, 40)
    .toLowerCase();
}

export async function runHeadless(o: RunOptions): Promise<RunResult> {
  const dist = o.dist ?? path.resolve('dist');
  if (!fs.existsSync(path.join(dist, 'index.html')))
    throw new Error('dist/ missing: run pnpm build first');
  const seed = o.replay ? o.replay.seed : (o.seed ?? 1);
  const mode = o.replay ? (o.replay.biomeMode ?? 0) : (o.biomeMode ?? 0);
  fs.mkdirSync(o.out, { recursive: true });
  const t0 = performance.now();
  const server = await serveStatic(dist);
  const {
    browser,
    page,
    console: log,
  } = await openPage(
    `${server.url}/?test=1&seed=${seed}&biome=${mode}&w=${o.width}&h=${o.height}`,
    {
      width: o.width,
      height: o.height,
    },
  );
  const info = await page.evaluate(() => window.__info!);
  if (o.replay)
    await page.evaluate(
      (r) => window.__game!.loadReplay(r),
      o.replay as unknown as Record<string, unknown>,
    );
  if (o.skip) await page.evaluate((n) => window.__game!.step(n), o.skip);
  const frames: FrameRecord[] = [];
  const pngs: Array<{
    file: string;
    label: string;
    frame: number;
    fog: { r: number; g: number; b: number };
  }> = [];
  const lines: string[] = [];
  for (let f = 0; f < o.frames; f++) {
    const snap = await page.evaluate(() => window.__game!.step(1));
    const hash = await page.evaluate(() => window.__game!.frameHash());
    const rec: FrameRecord = {
      frame: f,
      tick: Number(snap.tick),
      hash,
      checksum: String(snap.checksum),
      alive: Number(snap.alive),
    };
    frames.push(rec);
    lines.push(
      JSON.stringify({
        ...rec,
        x: snap.x,
        y: snap.y,
        z: snap.z,
        speed: snap.speed,
        score: snap.score,
        proximity: snap.proximity,
      }),
    );
    if (f % o.every === 0 || f === o.frames - 1) {
      // Page screenshot: canvas plus the HUD overlay (what the player sees).
      const file = path.join(o.out, `frame-${String(f).padStart(4, '0')}.png`);
      await page.screenshot({ path: file });
      const atm = await page.evaluate(() => window.__game!.atmosphere());
      const fog = {
        r: Math.round(atm.horizon[0]),
        g: Math.round(atm.horizon[1]),
        b: Math.round(atm.horizon[2]),
      };
      pngs.push({
        file,
        label: `f${f} t${rec.tick} z${Math.round(Number(snap.z))}`,
        frame: f,
        fog,
      });
    }
  }
  const chunkStats = await page.evaluate(() => window.__game!.chunkStats());
  await browser.close();
  server.close();
  fs.writeFileSync(path.join(o.out, 'frames.jsonl'), lines.join('\n') + '\n');
  const stats = pngs.map((p) => ({ frame: p.frame, stats: frameStats(readPng(p.file), p.fog) }));
  fs.writeFileSync(
    path.join(o.out, 'stats.json'),
    JSON.stringify({ info, chunkStats, stats }, null, 1),
  );
  await contactSheet(path.join(o.out, 'sheet.png'), pngs);
  // Node re-simulation for the checksum gate.
  let nodeChecksum: string;
  if (o.replay) {
    // The browser plays the replay's inputs then zero input, for skip + frames ticks; do the same here.
    nodeChecksum = hex32(checksum(simulateTicks(o.replay, (o.skip ?? 0) + o.frames)));
  } else {
    const { state } = recordRun(
      seed,
      (o.skip ?? 0) + o.frames,
      createPilot(seed, { mode }),
      undefined,
      mode,
    );
    nodeChecksum = hex32(checksum(state));
  }
  const hudAnchor = readPng(pngs[pngs.length - 1]!.file);
  const gates = runGates({ stats, frames, consoleErrors: log.errors, nodeChecksum, hudAnchor });
  const ok = gates.every((g) => g.ok);
  const key = rendererKey(info.renderer);
  fs.writeFileSync(
    path.join(o.out, 'hashes.json'),
    JSON.stringify(
      {
        rendererKey: key,
        renderer: info.renderer,
        seed,
        width: o.width,
        height: o.height,
        frames: Object.fromEntries(pngs.map((p) => [p.frame, frames[p.frame]!.hash])),
      },
      null,
      1,
    ),
  );
  const ms = Math.round(performance.now() - t0);
  fs.writeFileSync(path.join(o.out, 'gate.json'), JSON.stringify({ ok, gates, ms }, null, 1));
  return {
    rendererKey: key,
    renderer: info.renderer,
    frames,
    stats,
    gates,
    ok,
    consoleErrors: log.errors,
    ms,
  };
}

if (import.meta.main) {
  const f = parseArgs(process.argv.slice(2));
  const replay = f.replay ? (JSON.parse(fs.readFileSync(f.replay, 'utf8')) as Replay) : undefined;
  const result = await runHeadless({
    seed: Number(f.seed ?? 1),
    replay,
    frames: Number(f.frames ?? 300),
    every: Number(f.every ?? 30),
    width: Number(f.width ?? 640),
    height: Number(f.height ?? 360),
    out: f.out ?? 'runs/latest',
    skip: Number(f.skip ?? 0),
    biomeMode: parseBiomeMode(f.biome) ?? 0,
  });
  for (const g of result.gates)
    if (!g.ok || f.verbose) console.log(`${g.ok ? 'ok  ' : 'FAIL'} ${g.name}: ${g.detail}`);
  console.log(
    JSON.stringify({
      ok: result.ok,
      renderer: result.rendererKey,
      frames: result.frames.length,
      ms: result.ms,
      out: f.out ?? 'runs/latest',
    }),
  );
  if (!result.ok && f['no-gate'] !== 'true') process.exit(1);
}
