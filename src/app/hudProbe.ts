// Render-side proximity per side for the HUD edge glows. Samples the same field
// the sim uses, but nothing here feeds back into the sim.
import { FieldSampler, spineAt } from '../terrain/field.ts';
import { C } from '../sim/constants.ts';
import { basis } from '../sim/quat.ts';
import type { SimState } from '../sim/state.ts';
import type { HudView } from './hud.ts';

const PROBE_DIST = 8;
const GLOW_RANGE = 10;

export class HudProbe {
  private readonly sampler: FieldSampler;
  private readonly b = new Float64Array(9);
  constructor(seed: number) {
    this.sampler = new FieldSampler(seed);
  }

  view(state: SimState, replayLabel: string | null): HudView {
    const sp = spineAt(state.seed, state.z);
    const ceiling = sp.ceilY - C.CEIL_MARGIN;
    const altitude = (state.y - sp.floorY) / (ceiling - sp.floorY);
    const r = PROBE_DIST + 2;
    this.sampler.prepare(state.x - r, state.x + r, state.z - r, state.z + r);
    basis(state.qx, state.qy, state.qz, state.qw, this.b);
    const b = this.b;
    const near = (dx: number, dy: number, dz: number): number => {
      const d = this.sampler.density(
        state.x + dx * PROBE_DIST,
        state.y + dy * PROBE_DIST,
        state.z + dz * PROBE_DIST,
      );
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
    };
  }
}
