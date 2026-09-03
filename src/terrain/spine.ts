import type { FieldParams } from './params.ts';
import { fbm1, vnoise1 } from './noise.ts';

/** Everything that depends on z only: the corridor centreline and envelope. */
export interface Spine {
  cx: number;
  floorY: number;
  ceilY: number;
  coreY: number;
  hw: number;
}

export function createSpine(): Spine {
  return { cx: 0, floorY: 0, ceilY: 0, coreY: 0, hw: 0 };
}

export function spine(seed: number, z: number, p: FieldParams, out: Spine = createSpine()): Spine {
  out.cx =
    p.wanderAmp1 * fbm1(z / p.wanderLen1, seed ^ 0x101, 2) +
    p.wanderAmp2 * vnoise1(z / p.wanderLen2, seed ^ 0x104);
  out.floorY = p.floorWanderAmp * fbm1(z / p.floorWanderLen, seed ^ 0x102, 2) + p.floorOffset;
  out.ceilY = out.floorY + p.height;
  out.coreY = out.floorY + p.height * p.coreYFrac;
  out.hw = p.halfWidth * (1 + p.widthVar * vnoise1(z / p.widthLen, seed ^ 0x103));
  return out;
}
