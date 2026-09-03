// Crystal spires: smoother basalt walls with neon hexagonal crystals growing from
// the floor and walls; dark violet fog with a magenta rim light (research 03 §8.3).
import type { BiomeDef } from '../biomes.ts';
import type { BiomePalette } from '../palette.ts';
import type { FieldParams } from '../params.ts';
import { CANYON } from '../params.ts';

export const SPIRES_PARAMS: FieldParams = Object.freeze<FieldParams>({
  ...CANYON,
  halfWidth: 36,
  height: 120,
  profileLip: 0.3,
  profileOverhang: 0.5,
  warpAmp: 8,
  ridgeAmp: 3,
  ridgeLen: 34,
  detailAmp: 1,
  pillarProb: 0.15,
  boulderProb: 0.1,
  archProb: 0.15,
  crystalSpacing: 24,
  crystalFloorProb: 0.55,
  crystalWallProb: 0.3,
  crystalRMin: 2,
  crystalRMax: 5,
  crystalHMin: 16,
  crystalHMax: 42,
});

export const SPIRES_PALETTE: BiomePalette = Object.freeze<BiomePalette>({
  wall: [
    [88, 62, 128],
    [132, 96, 184],
    [104, 76, 150],
  ],
  floor: [
    [70, 54, 104],
    [96, 74, 136],
  ],
  ceil: [
    [56, 40, 96],
    [84, 60, 132],
  ],
  horizon: [70, 26, 104],
  skyTop: [18, 8, 36],
  sun: [255, 96, 220],
  accent: [51, 240, 255],
  bands: 4,
  crystals: [
    [51, 240, 255],
    [255, 64, 216],
    [180, 255, 60],
  ],
});

export const SPIRES_BIOME: BiomeDef = Object.freeze<BiomeDef>({
  id: 2,
  name: 'crystal-spires',
  params: SPIRES_PARAMS,
  palette: SPIRES_PALETTE,
  atmosphere: {
    fogDensity: 0.0045,
    sunIntensity: 2.2,
    hemiIntensity: 1.6,
    ambient: [150, 120, 210],
    ground: [90, 66, 120],
  },
});
