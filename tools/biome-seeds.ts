// Prints which special biome each seed's first special segment uses, for choosing evidence seeds.
//   node tools/biome-seeds.ts [count]
import { biomeForSegment } from '../src/terrain/biomes.ts';
const n = Number(process.argv[2] ?? 12);
for (let seed = 1; seed <= n; seed++)
  console.log(seed, biomeForSegment(seed, 1).name, biomeForSegment(seed, 3).name);
