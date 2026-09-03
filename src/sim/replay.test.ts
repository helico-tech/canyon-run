import { expect, test } from 'vitest';
import { sfc32Next, sfc32Seed } from './prng.ts';
import { createPilot } from './pilot.ts';
import { decodeRuns, encodeRuns, recordRun, validateReplay } from './replay.ts';
import type { Replay } from './replay.ts';
import { KEY } from './input.ts';

test('RLE codec round-trips 7200 random frames and merges identical runs', () => {
  const rng = sfc32Seed(1);
  const frames = [];
  for (let i = 0; i < 7200; i++) {
    const r = sfc32Next(rng);
    frames.push({ keys: r & 0xff, dx: ((r >>> 8) % 7) - 3, dy: ((r >>> 12) % 5) - 2 });
  }
  const runs = encodeRuns(frames);
  expect(Array.from(decodeRuns(runs))).toEqual(frames);
  const same = encodeRuns([
    { keys: 1, dx: 0, dy: 0 },
    { keys: 1, dx: 0, dy: 0 },
    { keys: 2, dx: 0, dy: 0 },
  ]);
  expect(same).toEqual([
    [2, 1, 0, 0],
    [1, 2, 0, 0],
  ]);
});

test('a recorded pilot run validates, and a one-count mouse mutation is caught at the next checkpoint', () => {
  const { replay, state } = recordRun(7, 600, createPilot(7));
  expect(state.alive).toBe(1);
  const ok = validateReplay(replay);
  expect(ok.verdict).toBe('ok');
  if (ok.verdict === 'ok') expect(ok.score).toBe(replay.finalScore);

  const mutated: Replay = JSON.parse(JSON.stringify(replay));
  let tick = 0;
  for (const run of mutated.runs) {
    if (tick + run[0] > 250) {
      run[2] += 1;
      break;
    }
    tick += run[0];
  }
  const bad = validateReplay(mutated);
  expect(bad.verdict).toBe('checkpoint-mismatch');
  if (bad.verdict === 'checkpoint-mismatch') expect(bad.tick).toBe(300);
});

test('version, constants and malformed replays are rejected', () => {
  const { replay } = recordRun(3, 120, () => ({ keys: KEY.THR_UP, dx: 0, dy: 0 }));
  expect(validateReplay({ ...replay, simVersion: '9.9.9' }).verdict).toBe('version-mismatch');
  expect(validateReplay({ ...replay, constantsHash: 'deadbeef' }).verdict).toBe('version-mismatch');
  expect(validateReplay({ ...replay, ticks: replay.ticks + 5 }).verdict).toBe('malformed');
  expect(validateReplay({ ...replay, runs: [[120, 0x100, 0, 0]] }).verdict).toBe('malformed');
  expect(validateReplay({ ...replay, finalScore: replay.finalScore + 1 }).verdict).toBe(
    'score-mismatch',
  );
  expect(validateReplay({} as Replay).verdict).toBe('malformed');
});
