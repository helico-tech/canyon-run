// Render-side proximity per side for the HUD edge glows. Samples the same field
// the sim uses, but nothing here feeds back into the sim.
import { FieldSampler, spineAt } from '../terrain/field.ts';
import { biomeForSegment, segmentAt } from '../terrain/biomes.ts';
import { C } from '../sim/constants.ts';
import { basis } from '../sim/quat.ts';
import type { SimState } from '../sim/state.ts';
import type { HudView } from './hud.ts';

const PROBE_DIST = 8;
const GLOW_RANGE = 10;
/** The gate countdown appears this far before a segment boundary (u). */
export const GATE_CUE_RANGE = 400;

export class HudProbe {
  private readonly sampler: FieldSampler;
  private readonly b = new Float64Array(9);
  private readonly mode: number;
  constructor(seed: number, mode = 0) {
    this.sampler = new FieldSampler(seed, mode);
    this.mode = mode;
  }

  view(
    state: SimState,
    replayLabel: string | null,
    extra?: (x: number, y: number, z: number) => number,
  ): HudView {
    const sp = spineAt(state.seed, state.z, undefined, this.mode);
    const seg = segmentAt(state.z);
    const ceiling = sp.ceilY - C.CEIL_MARGIN;
    const altitude = (state.y - sp.floorY) / (ceiling - sp.floorY);
    const r = PROBE_DIST + 2;
    this.sampler.prepare(state.x - r, state.x + r, state.z - r, state.z + r);
    basis(state.qx, state.qy, state.qz, state.qw, this.b);
    const b = this.b;
    const near = (dx: number, dy: number, dz: number): number => {
      const px = state.x + dx * PROBE_DIST;
      const py = state.y + dy * PROBE_DIST;
      const pz = state.z + dz * PROBE_DIST;
      let d = this.sampler.density(px, py, pz);
      if (extra) {
        const e = extra(px, py, pz);
        if (e > d) d = e;
      }
      const g = 1 + d / GLOW_RANGE; // d = -GLOW_RANGE → 0, d = 0 → 1
      return g < 0 ? 0 : g > 1 ? 1 : g * g;
    };
    return {
      altitude,
      glow: [
        near(-b[0]!, -b[1]!, -b[2]!),
        near(b[0]!, b[1]!, b[2]!),
        near(b[3]!, b[4]!, b[5]!),
        near(-b[3]!, -b[4]!, -b[5]!),
      ],
      replayLabel,
      biome: biomeForSegment(state.seed, seg.index, this.mode).name,
      gateIn: seg.end - state.z <= GATE_CUE_RANGE ? seg.end - state.z : -1,
    };
  }
}
