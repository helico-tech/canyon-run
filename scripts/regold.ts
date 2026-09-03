// Regenerates the golden replays and bumps SIM_VERSION (patch). Refuses on a dirty tree.
//   node scripts/regold.ts [--no-bump]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from './lib/repo.ts';

const versionFile = path.join(repoRoot, 'src', 'sim', 'version.ts');
const noBump = process.argv.includes('--no-bump');
const dirty = execFileSync('git', ['status', '--porcelain'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim();
if (dirty) {
  console.error('regold: working tree is dirty; commit or stash first');
  process.exit(1);
}
if (!noBump) {
  const src = fs.readFileSync(versionFile, 'utf8');
  const m = /SIM_VERSION = '(\d+)\.(\d+)\.(\d+)'/.exec(src);
  if (!m) throw new Error('cannot find SIM_VERSION');
  const next = `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
  fs.writeFileSync(versionFile, src.replace(/SIM_VERSION = '[^']+'/, `SIM_VERSION = '${next}'`));
  console.log(`regold: SIM_VERSION -> ${next}`);
}
const dir = path.join(repoRoot, 'tests', 'replays');
fs.mkdirSync(dir, { recursive: true });
for (const seed of [1, 2, 3]) {
  const out = path.join(dir, `seed-${seed}.json`);
  execFileSync(
    'node',
    [
      path.join(repoRoot, 'src', 'cli', 'replay.ts'),
      'run',
      '--seed',
      String(seed),
      '--ticks',
      '1800',
      '--out',
      out,
    ],
    {
      cwd: repoRoot,
      stdio: 'inherit',
    },
  );
}
console.log('regold: done');
