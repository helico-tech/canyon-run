import { expect, test } from 'vitest';
import { Storage } from './storage.ts';

function memory(): {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  map: Map<string, string>;
} {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

test('records bests overall and per seed, keeps the last ten runs', () => {
  const mem = memory();
  const s = new Storage(mem);
  expect(s.best()).toBeNull();
  const r1 = s.recordRun({ seed: 1, score: 100, ticks: 60, distance: 50, topSpeed: 60, date: 'd' });
  expect(r1).toEqual({ newBest: true, newSeedBest: true });
  const r2 = s.recordRun({ seed: 2, score: 50, ticks: 60, distance: 50, topSpeed: 60, date: 'd' });
  expect(r2).toEqual({ newBest: false, newSeedBest: true });
  const r3 = s.recordRun({ seed: 1, score: 80, ticks: 60, distance: 50, topSpeed: 60, date: 'd' });
  expect(r3).toEqual({ newBest: false, newSeedBest: false });
  expect(s.best()?.score).toBe(100);
  expect(s.bestForSeed(2)?.score).toBe(50);
  for (let i = 0; i < 12; i++)
    s.recordRun({ seed: 3, score: i, ticks: 1, distance: 1, topSpeed: 1, date: 'd' });
  expect(s.runs()).toHaveLength(10);
  s.setLastSeed(0xdeadbeef);
  expect(s.lastSeed()).toBe(0xdeadbeef);
});

test('survives a missing or throwing store', () => {
  const none = new Storage(null);
  expect(none.best()).toBeNull();
  expect(
    none.recordRun({ seed: 1, score: 1, ticks: 1, distance: 1, topSpeed: 1, date: 'd' }),
  ).toEqual({ newBest: true, newSeedBest: true });
  const throwing = new Storage({
    getItem: () => {
      throw new Error('nope');
    },
    setItem: () => {
      throw new Error('nope');
    },
  });
  expect(throwing.lastSeed()).toBeNull();
  throwing.setLastSeed(1);
});

test('treats stored values of the wrong shape as absent', () => {
  const mem = memory();
  mem.map.set('canyon.runs', '{}');
  mem.map.set('canyon.best', '"x"');
  mem.map.set('canyon.best.1', '{"score":"high"}');
  mem.map.set('canyon.lastSeed', '"abc"');
  const s = new Storage(mem);
  expect(s.runs()).toEqual([]);
  expect(s.best()).toBeNull();
  expect(s.bestForSeed(1)).toBeNull();
  expect(s.lastSeed()).toBeNull();
  const run = { seed: 1, score: 7, ticks: 1, distance: 1, topSpeed: 1, date: 'd' };
  expect(s.recordRun(run)).toEqual({ newBest: true, newSeedBest: true });
  expect(s.runs()).toEqual([run]);
  expect(s.best()?.score).toBe(7);
  mem.map.set(
    'canyon.runs',
    '[null, 1, {"seed":2,"score":3,"ticks":1,"distance":1,"topSpeed":1,"date":"d"}]',
  );
  expect(s.runs()).toHaveLength(1);
});
