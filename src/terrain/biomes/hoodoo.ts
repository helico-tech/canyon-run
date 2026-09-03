// Hoodoo desert: a wide low hall whose walls recede into warm fog, an obstacle
// field of stepped hoodoos, rounded mesas and boulders in creamy oranges.
import type { BiomeDef } from '../biomes.ts';
import type { BiomePalette } from '../palette.ts';
import type { FieldParams } from '../params.ts';
import { CANYON } from '../params.ts';

export const HOODOO_PARAMS: FieldParams = Object.freeze<FieldParams>({
  ...CANYON,
  halfWidth: 90,
  height: 100,
  coreYFrac: 0.35,
  profileLip: 0.6,
  profileOverhang: 0,
  warpAmp: 12,
  warpLen: 70,
  ridgeAmp: 4,
  ridgeLen: 35,
  ridgeYStretch: 0.15,
  floorNoiseAmp: 3,
  ceilNoiseAmp: 3,
  detailAmp: 1.2,
  pillarSpacing: 40,
  pillarProb: 0.5,
  pillarRadius: 6,
  pillarStepLen: 6,
  mesaSpacing: 96,
  mesaProb: 0.15,
  mesaSizeMin: 20,
  mesaSizeMax: 40,
  mesaHeight: 28,
  boulderProb: 0.2,
  archProb: 0.1,
});

export const HOODOO_PALETTE: BiomePalette = Object.freeze<BiomePalette>({
  wall: [
    [232, 138, 74],
    [242, 178, 122],
    [255, 224, 176],
    [214, 122, 70],
  ],
  floor: [
    [232, 200, 144],
    [246, 222, 176],
  ],
  ceil: [
    [214, 150, 100],
    [236, 190, 140],
  ],
  horizon: [246, 217, 168],
  skyTop: [120, 170, 220],
  sun: [255, 244, 214],
  accent: [40, 140, 255],
  bands: 8,
});

export const HOODOO_BIOME: BiomeDef = Object.freeze<BiomeDef>({
  id: 4,
  name: 'hoodoo-desert',
  params: HOODOO_PARAMS,
  palette: HOODOO_PALETTE,
  atmosphere: {
    fogDensity: 0.0052,
    sunIntensity: 2.6,
    hemiIntensity: 1.0,
    ambient: [200, 190, 200],
    ground: [170, 130, 90],
  },
});
