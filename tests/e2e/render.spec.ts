import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { runHeadless } from '../../tools/headless/run.ts';

const root = path.resolve(new URL('../../', import.meta.url).pathname);

test('seed 1 headless run passes the semantic gates and matches golden hashes', async () => {
  const out = path.join(root, 'runs', 'e2e-seed1');
  const result = await runHeadless({
    seed: 1,
    frames: 120,
    every: 30,
    width: 640,
    height: 360,
    out,
    dist: path.join(root, 'dist'),
  });
  for (const g of result.gates) expect(g.ok, `${g.name}: ${g.detail}`).toBe(true);
  const goldenFile = path.join(root, 'tests', 'golden', `${result.rendererKey}.json`);
  if (!fs.existsSync(goldenFile)) {
    test.info().annotations.push({
      type: 'notice',
      description: `no golden for renderer ${result.rendererKey}; skipped hash comparison`,
    });
    return;
  }
  const golden = JSON.parse(fs.readFileSync(goldenFile, 'utf8')) as {
    frames: Record<string, string>;
  };
  for (const [frame, hash] of Object.entries(golden.frames)) {
    const got = result.frames[Number(frame)]?.hash;
    expect(got, `frame ${frame} hash`).toBe(hash);
  }
});
