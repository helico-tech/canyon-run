// Trench run: a dead-straight artificial trench open to a starfield, with
// greebled walls and floor, square towers and cross beams to fly under.
import type { BiomeDef } from '../biomes.ts';
import type { BiomePalette } from '../palette.ts';
import type { FieldParams } from '../params.ts';
import { CANYON } from '../params.ts';

export const TRENCH_PARAMS: FieldParams = Object.freeze<FieldParams>({
  ...CANYON,
  halfWidth: 28,
  height: 72,
  coreYFrac: 0.45,
  coreRadius: 11,
  profileLip: 0,
  profileOverhang: 0,
  roofOpen: 1,
  widthVar: 0.05,
  warpAmp: 0,
  ridgeAmp: 0,
  floorNoiseAmp: 0,
  ceilNoiseAmp: 0,
  detailAmp: 0,
  smoothK: 1,
  pillarProb: 0,
  boulderProb: 0,
  archProb: 0,
  boxFloorSpacing: 22,
  boxFloorProb: 0.45,
  boxWallSpacing: 18,
  boxWallProb: 0.55,
  boxHalfMin: 2.5,
  boxHalfMax: 6,
  boxHeightMin: 2,
  boxHeightMax: 7,
  towerSpacing: 64,
  towerProb: 0.35,
  beamSpacing: 150,
  beamProb: 0.6,
  beamHalf: 2.5,
});

export const TRENCH_PALETTE: BiomePalette = Object.freeze<BiomePalette>({
  wall: [
    [90, 96, 112],
    [122, 128, 144],
    [200, 232, 255],
    [84, 90, 106],
  ],
  floor: [
    [74, 80, 92],
    [106, 112, 124],
  ],
  ceil: [
    [60, 64, 76],
    [80, 84, 96],
  ],
  horizon: [10, 12, 20],
  skyTop: [0, 0, 4],
  sun: [255, 255, 255],
  accent: [255, 59, 48],
  bands: 10,
  stars: 1,
});

export const TRENCH_BIOME: BiomeDef = Object.freeze<BiomeDef>({
  id: 6,
  name: 'trench-run',
  params: TRENCH_PARAMS,
  palette: TRENCH_PALETTE,
  atmosphere: {
    fogDensity: 0.0022,
    sunIntensity: 2.6,
    hemiIntensity: 0.6,
    ambient: [110, 120, 150],
    ground: [40, 42, 52],
  },
  adversaries: {
    spacing: 200,
    prob: 0.9,
    archetypes: [5, 0],
    rMin: 2,
    rMax: 3,
    lenMin: 4,
    lenMax: 8,
    hz: 1.5,
    periodMin: 240,
    periodMax: 360,
    ampX: 0.5,
    ampY: 0.3,
    gapMin: 28,
    closeDist: 240,
  },
});
