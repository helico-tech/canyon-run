// Test fixture: a canyon-shaped special biome with every adversary archetype at
// every cell, so tests and audits exercise all kinds without hunting for seeds.
import { CANYON_BIOME, SPECIALS } from '../terrain/biomes.ts';
import type { BiomeDef } from '../terrain/biomes.ts';
import { CANYON } from '../terrain/params.ts';
import type { AdversaryParams } from '../terrain/params.ts';
import { ARCHETYPES } from './adversaries.ts';

export const ARENA: AdversaryParams = {
  spacing: 150,
  prob: 1,
  archetypes: ARCHETYPES.map((_, i) => i),
  rMin: 2,
  rMax: 4,
  lenMin: 6,
  lenMax: 24,
  hz: 1.5,
  periodMin: 180,
  periodMax: 360,
  ampX: 0.8,
  ampY: 0.8,
  gapMin: 28,
  closeDist: 200,
};

export const ARENA_BIOME: BiomeDef = {
  id: 90,
  name: 'arena',
  params: { ...CANYON },
  palette: CANYON_BIOME.palette,
  atmosphere: CANYON_BIOME.atmosphere,
  adversaries: ARENA,
};

/** Runs `fn` with the arena as the only special biome, then restores the registry. */
export function withArena<T>(fn: () => T): T {
  const registered = SPECIALS.slice();
  SPECIALS.length = 0;
  SPECIALS.push(ARENA_BIOME);
  try {
    return fn();
  } finally {
    SPECIALS.length = 0;
    SPECIALS.push(...registered);
  }
}
