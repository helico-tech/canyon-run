// Lava rift: a deep, near-vertical slot with horizontal strata over a flat lava
// floor; rock islands and arch bridges; dark red fog, orange glow from below.
import type { BiomeDef } from '../biomes.ts';
import type { BiomePalette } from '../palette.ts';
import type { FieldParams } from '../params.ts';
import { CANYON } from '../params.ts';

export const LAVA_PARAMS: FieldParams = Object.freeze<FieldParams>({
  ...CANYON,
  halfWidth: 30,
  height: 140,
  coreYFrac: 0.4,
  profileLip: 0.1,
  profileOverhang: 0,
  warpAmp: 5,
  ridgeAmp: 9,
  ridgeLen: 40,
  ridgeYStretch: 0.1,
  ridgeOct: 3,
  floorNoiseAmp: 0.5,
  ceilNoiseAmp: 4,
  detailAmp: 2,
  pillarProb: 0.1,
  pillarRadius: 4,
  boulderSpacing: 26,
  boulderProb: 0.3,
  boulderRMin: 4,
  boulderRMax: 10,
  archSpacing: 200,
  archProb: 0.5,
  archRMin: 4,
  archRMax: 6,
});

export const LAVA_PALETTE: BiomePalette = Object.freeze<BiomePalette>({
  wall: [
    [40, 34, 34],
    [66, 54, 52],
    [255, 106, 30],
    [46, 38, 38],
  ],
  floor: [
    [255, 122, 42],
    [255, 194, 74],
  ],
  ceil: [
    [48, 30, 30],
    [70, 44, 40],
  ],
  horizon: [80, 30, 16],
  skyTop: [24, 8, 8],
  sun: [255, 140, 66],
  accent: [255, 210, 63],
  bands: 6,
});

export const LAVA_BIOME: BiomeDef = Object.freeze<BiomeDef>({
  id: 3,
  name: 'lava-rift',
  params: LAVA_PARAMS,
  palette: LAVA_PALETTE,
  atmosphere: {
    fogDensity: 0.0042,
    sunIntensity: 1.2,
    hemiIntensity: 1.6,
    // The hemisphere "sky" lights up-facing surfaces: make it the lava glow so the floor burns.
    ambient: [255, 150, 60],
    ground: [110, 40, 24],
  },
  adversaries: {
    spacing: 240,
    prob: 0.85,
    archetypes: [8, 2, 5],
    rMin: 3,
    rMax: 5,
    lenMin: 6,
    lenMax: 10,
    hz: 2,
    periodMin: 240,
    periodMax: 400,
    ampX: 0.5,
    ampY: 0.6,
    gapMin: 28,
    closeDist: 220,
  },
});
