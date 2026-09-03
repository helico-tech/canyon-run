// Floating archipelago: a tall pastel hall with the floor far below, ridged rocks
// hanging in the air to slalom between, arches, and bright pink-white fog.
import type { BiomeDef } from '../biomes.ts';
import type { BiomePalette } from '../palette.ts';
import type { FieldParams } from '../params.ts';
import { CANYON } from '../params.ts';

export const ARCHIPELAGO_PARAMS: FieldParams = Object.freeze<FieldParams>({
  ...CANYON,
  halfWidth: 80,
  height: 170,
  floorOffset: -40,
  coreYFrac: 0.6,
  profileLip: 0.2,
  profileOverhang: 0.3,
  warpAmp: 14,
  warpLen: 60,
  ridgeAmp: 4,
  ridgeLen: 40,
  floorNoiseAmp: 8,
  detailAmp: 1.2,
  pillarProb: 0,
  boulderProb: 0.1,
  archSpacing: 220,
  archProb: 0.3,
  archRMin: 4,
  archRMax: 7,
  rockSpacing: 48,
  rockProb: 0.5,
  rockRMin: 6,
  rockRMax: 18,
});

export const ARCHIPELAGO_PALETTE: BiomePalette = Object.freeze<BiomePalette>({
  wall: [
    [122, 90, 166],
    [183, 132, 210],
    [240, 168, 200],
  ],
  floor: [
    [60, 140, 140],
    [90, 170, 170],
  ],
  ceil: [
    [200, 170, 220],
    [230, 200, 235],
  ],
  horizon: [200, 232, 240],
  skyTop: [120, 150, 230],
  sun: [255, 240, 250],
  accent: [255, 120, 180],
  bands: 5,
});

export const ARCHIPELAGO_BIOME: BiomeDef = Object.freeze<BiomeDef>({
  id: 5,
  name: 'floating-archipelago',
  params: ARCHIPELAGO_PARAMS,
  palette: ARCHIPELAGO_PALETTE,
  atmosphere: {
    fogDensity: 0.0048,
    sunIntensity: 2.4,
    hemiIntensity: 1.1,
    ambient: [200, 200, 240],
    ground: [120, 140, 160],
  },
  adversaries: {
    spacing: 260,
    prob: 0.8,
    archetypes: [10, 4, 3],
    rMin: 3,
    rMax: 5,
    lenMin: 17,
    lenMax: 24,
    hz: 2,
    periodMin: 300,
    periodMax: 480,
    ampX: 0.5,
    ampY: 0.5,
    gapMin: 28,
    closeDist: 220,
  },
});
