import { expect, test } from 'vitest';
import { createState } from '../sim/state.ts';
import { biomeForSegment, SEGMENT_HUB } from '../terrain/biomes.ts';
import { HudProbe } from './hudProbe.ts';

test('the view names the segment biome and counts down to the next gate inside its range', () => {
  const probe = new HudProbe(1, 0);
  const s = createState(1, 0);
  s.z = 100;
  const early = probe.view(s, null);
  expect(early.biome).toBe(biomeForSegment(1, 0, 0).name);
  expect(early.gateIn).toBe(-1);
  s.z = SEGMENT_HUB - 250;
  const near = probe.view(s, null);
  expect(near.gateIn).toBeCloseTo(250, 6);
  s.z = SEGMENT_HUB + 10;
  const after = probe.view(s, null);
  expect(after.biome).toBe(biomeForSegment(1, 1, 0).name);
  expect(after.gateIn).toBe(-1);
});
