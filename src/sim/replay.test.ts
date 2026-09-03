import { expect, test } from 'vitest';
import { sfc32Next, sfc32Seed } from './prng.ts';
import { createPilot } from './pilot.ts';
import {
  decodeRuns,
  encodeRuns,
  recordRun,
  replaySource,
  simulateTicks,
  validateReplay,
} from './replay.ts';
import { checksum } from './state.ts';
import { hex32 } from './hash.ts';
import type { Replay } from './replay.ts';
import { KEY, ZERO_INPUT } from './input.ts';

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
  expect(validateReplay({ ...replay, runs: ['abcd'] as unknown as Replay['runs'] }).verdict).toBe(
    'malformed',
  );
  expect(
    validateReplay({ ...replay, checkpoints: [5] as unknown as Replay['checkpoints'] }).verdict,
  ).toBe('malformed');
  expect(validateReplay({ ...replay, runs: [[120, 0, 40000, 0]] }).verdict).toBe('malformed');
});

test('simulateTicks plays a prefix of a replay and zero input past its end', () => {
  const { replay } = recordRun(9, 300, createPilot(9));
  const prefix = simulateTicks(replay, 120);
  expect(prefix.tick).toBe(120);
  const full = simulateTicks(replay, 300);
  const v = validateReplay(replay);
  expect(v.verdict).toBe('ok');
  if (v.verdict === 'ok') expect(hex32(checksum(full))).toBe(v.checksum);
  const beyond = simulateTicks(replay, 330);
  expect(beyond.tick).toBe(330);
});

test('the biome mode is part of the state checksum and the replay header', () => {
  const auto = recordRun(11, 120, createPilot(11));
  const forced = recordRun(11, 120, createPilot(11, { mode: 255 }), undefined, 255);
  expect(auto.replay.biomeMode).toBe(0);
  expect(forced.replay.biomeMode).toBe(255);
  expect(forced.replay.finalChecksum).not.toBe(auto.replay.finalChecksum);
  expect(validateReplay(forced.replay).verdict).toBe('ok');
  // A file claiming another mode diverges at the first checkpoint.
  expect(validateReplay({ ...forced.replay, biomeMode: 0 }).verdict).toBe('checkpoint-mismatch');
});

test('replaySource feeds exactly ticks inputs, then zero input, even with trailing runs', () => {
  const { replay: rec } = recordRun(5, 120, createPilot(5, { throttle: 'full' }));
  const r: Replay = { ...rec, runs: [...rec.runs, [600, KEY.PITCH_DOWN, 3, -2]] };
  const src = replaySource(r);
  const fromRuns = [...decodeRuns(rec.runs)];
  for (let i = 0; i < r.ticks; i++) expect(src()).toEqual(fromRuns[i]);
  for (let i = 0; i < 5; i++) expect(src()).toEqual(ZERO_INPUT);
});
