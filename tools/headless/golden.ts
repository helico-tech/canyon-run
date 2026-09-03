// Regenerates tests/golden/<rendererKey>.json from a seed-1, 120-frame run.
import fs from 'node:fs';
import path from 'node:path';
import { runHeadless } from './run.ts';

const out = path.resolve('runs', 'golden');
const result = await runHeadless({ seed: 1, frames: 120, every: 30, width: 640, height: 360, out });
if (!result.ok) {
  console.error('gates failed; not writing golden');
  process.exit(1);
}
const hashes = JSON.parse(fs.readFileSync(path.join(out, 'hashes.json'), 'utf8'));
const file = path.resolve('tests', 'golden', `${result.rendererKey}.json`);
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(hashes, null, 1) + '\n');
console.log(`wrote ${path.relative(process.cwd(), file)}`);
