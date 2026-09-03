import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
import { validateReplay } from './replay.ts';
import type { Replay } from './replay.ts';

const dir = path.join(new URL('../../tests/replays/', import.meta.url).pathname);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));

test('golden replays exist', () => {
  expect(files.length).toBeGreaterThanOrEqual(3);
});

for (const file of files) {
  test(`golden ${file} replays bit-identically`, () => {
    const replay = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Replay;
    const v = validateReplay(replay);
    expect(v).toMatchObject({
      verdict: 'ok',
      score: replay.finalScore,
      checksum: replay.finalChecksum,
    });
  });
}
