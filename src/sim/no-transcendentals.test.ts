// Belt and braces for ADR 0002: replay a golden with every engine-dependent Math
// function replaced by a throwing stub. If the core reaches for one, this fails.
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { validateReplay } from './replay.ts';
import type { Replay } from './replay.ts';

const BANNED = [
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sinh',
  'cosh',
  'tanh',
  'asinh',
  'acosh',
  'atanh',
  'exp',
  'expm1',
  'log',
  'log1p',
  'log2',
  'log10',
  'pow',
  'hypot',
  'cbrt',
  'random',
  'round',
] as const;
const saved: Partial<Record<(typeof BANNED)[number], unknown>> = {};

beforeAll(() => {
  for (const name of BANNED) {
    saved[name] = Math[name];
    Object.defineProperty(Math, name, {
      value: () => {
        throw new Error(`Math.${name} called inside the deterministic core`);
      },
      configurable: true,
      writable: true,
    });
  }
});
afterAll(() => {
  for (const name of BANNED)
    Object.defineProperty(Math, name, { value: saved[name], configurable: true, writable: true });
});

test('a golden replay validates with transcendental Math stubbed out', () => {
  const file = path.join(new URL('../../tests/replays/seed-1.json', import.meta.url).pathname);
  const replay = JSON.parse(fs.readFileSync(file, 'utf8')) as Replay;
  expect(() => Math.sin(1)).toThrow();
  const v = validateReplay(replay);
  expect(v.verdict).toBe('ok');
});
