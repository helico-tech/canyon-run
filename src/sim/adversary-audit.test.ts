import { expect, test } from 'vitest';
import { biomeModes } from '../terrain/biomes.ts';
import { auditWorld } from './adversaryAudit.ts';
import { withArena } from './arena.fixture.ts';

test(
  'every station of seeds 1-3 (auto mode, 4000 u) keeps a reachable hull-sized free disc',
  { timeout: 120000 },
  () => {
    let stations = 0;
    for (const seed of [1, 2, 3]) {
      const r = auditWorld(seed, 0, 0, 4000);
      stations += r.stations;
      expect(
        r.failures.map((f) => `${f.shape}/${f.motion} z ${Math.round(f.z)}: ${f.reason}`),
      ).toEqual([]);
    }
    expect(stations).toBeGreaterThan(3);
  },
);

test(
  'forced biomes: seed 1 over 3000 u passes the audit for every biome',
  { timeout: 180000 },
  () => {
    for (const m of biomeModes()) {
      if (m.name === 'auto' || m.name === 'canyon') continue;
      const r = auditWorld(1, m.mode, 0, 3000);
      expect(
        r.failures.map((f) => `${m.name} ${f.shape}/${f.motion} z ${Math.round(f.z)}: ${f.reason}`),
      ).toEqual([]);
    }
  },
);

test(
  'the arena (every archetype, core crossings from segment 4) passes the audit over 9000 u',
  { timeout: 120000 },
  () => {
    withArena(() => {
      for (const seed of [1, 2]) {
        const r = auditWorld(seed, 0, 0, 9000);
        expect(r.stations).toBeGreaterThan(8);
        expect(
          r.failures.map((v) => `${v.shape}/${v.motion} z${Math.round(v.z)}: ${v.reason}`),
        ).toEqual([]);
      }
    });
  },
);
