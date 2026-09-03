// Replay CLI.
//   node src/cli/replay.ts validate <file.json>
//   node src/cli/replay.ts run --seed N --ticks T --out file.json [--throttle vary|full|idle]
import fs from 'node:fs';
import { createPilot } from '../sim/pilot.ts';
import { recordRun, validateReplay } from '../sim/replay.ts';
import { parseArgs } from './args.ts';
import { parseBiomeMode } from '../terrain/biomes.ts';

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'validate') {
  const file = rest[0];
  if (!file) {
    console.error('usage: validate <file.json>');
    process.exit(2);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.log(JSON.stringify({ verdict: 'malformed', detail: String(err) }));
    process.exit(1);
  }
  const t0 = performance.now();
  const v = validateReplay(parsed as never);
  const ms = Math.round(performance.now() - t0);
  if (v.verdict === 'ok') {
    console.log(
      JSON.stringify({ verdict: 'ok', score: v.score, ticks: v.ticks, checksum: v.checksum, ms }),
    );
    process.exit(0);
  }
  console.log(JSON.stringify({ ...v, ms }));
  process.exit(1);
} else if (cmd === 'run') {
  const f = parseArgs(rest);
  const seed = Number(f.seed ?? 1) >>> 0;
  const ticks = Number(f.ticks ?? 1800);
  const throttle = (f.throttle ?? 'vary') as 'vary' | 'full' | 'idle';
  const mode = parseBiomeMode(f.biome) ?? 0;
  const { replay, state } = recordRun(
    seed,
    ticks,
    createPilot(seed, { throttle, mode }),
    { recordedBy: `pilot/${throttle}` },
    mode,
  );
  if (f.out) fs.writeFileSync(f.out, JSON.stringify(replay) + '\n');
  else console.log(JSON.stringify(replay));
  console.error(
    JSON.stringify({
      seed,
      ticks,
      alive: state.alive,
      score: state.score,
      z: Math.round(state.z),
      runs: replay.runs.length,
    }),
  );
} else {
  console.error('commands: validate <file>, run --seed N --ticks T --out file');
  process.exit(2);
}
