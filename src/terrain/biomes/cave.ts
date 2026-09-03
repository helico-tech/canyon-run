// Cave: a low elliptic tube with stalactites, stalagmites, columns and dead-end
// side tunnels; dark rock with cyan strata bands under dense fog (research 03 §8.3).
import type { BiomeDef } from '../biomes.ts';
import type { BiomePalette } from '../palette.ts';
import type { FieldParams } from '../params.ts';
import { CANYON } from '../params.ts';

export const CAVE_PARAMS: FieldParams = Object.freeze<FieldParams>({
  ...CANYON,
  halfWidth: 30,
  height: 62,
  coreYFrac: 0.5,
  coreRadius: 11,
  profileLip: 0,
  profileOverhang: 0,
  tubeness: 1,
  stalactiteAmp: 9,
  stalagmiteAmp: 6,
  spikeLen: 8,
  warpAmp: 6,
  warpLen: 40,
  ridgeAmp: 5,
  ridgeLen: 18,
  ridgeYStretch: 1,
  ridgeOct: 2,
  floorNoiseAmp: 3,
  ceilNoiseAmp: 3,
  detailAmp: 1.2,
  pillarSpacing: 40,
  pillarProb: 0.5,
  pillarRadius: 4,
  boulderSpacing: 24,
  boulderProb: 0.3,
  boulderRMin: 2,
  boulderRMax: 5,
  archProb: 0,
  tunnelSpacing: 200,
  tunnelProb: 0.4,
  tunnelRMin: 8,
  tunnelRMax: 12,
  tunnelLenMin: 60,
  tunnelLenMax: 120,
});

export const CAVE_PALETTE: BiomePalette = Object.freeze<BiomePalette>({
  wall: [
    [44, 66, 110],
    [72, 118, 170],
    [60, 230, 235],
    [44, 66, 110],
  ],
  floor: [
    [70, 88, 108],
    [98, 120, 140],
  ],
  ceil: [
    [40, 44, 84],
    [96, 70, 150],
  ],
  horizon: [12, 20, 38],
  skyTop: [4, 6, 14],
  sun: [150, 190, 255],
  accent: [60, 230, 235],
  bands: 5,
});

export const CAVE_BIOME: BiomeDef = Object.freeze<BiomeDef>({
  id: 1,
  name: 'cave',
  params: CAVE_PARAMS,
  palette: CAVE_PALETTE,
  atmosphere: {
    fogDensity: 0.0062,
    sunIntensity: 1.8,
    hemiIntensity: 1.5,
    ambient: [120, 150, 200],
    ground: [70, 80, 100],
  },
  adversaries: {
    spacing: 240,
    prob: 0.8,
    archetypes: [6],
    rMin: 1.5,
    rMax: 2.5,
    lenMin: 8,
    lenMax: 12,
    hz: 1.5,
    periodMin: 200,
    periodMax: 320,
    ampX: 0.5,
    ampY: 0.3,
    gapMin: 28,
    closeDist: 220,
  },
});
