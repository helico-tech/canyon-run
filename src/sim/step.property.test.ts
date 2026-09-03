import fc from 'fast-check';
import { expect, test } from 'vitest';
import { CANYON } from '../terrain/params.ts';
import { spine } from '../terrain/spine.ts';
import { C } from './constants.ts';
import { checksum, cloneState, createState } from './state.ts';
import { step } from './step.ts';

const inputArb = fc.record({
  keys: fc.integer({ min: 0, max: 255 }),
  dx: fc.integer({ min: -400, max: 400 }),
  dy: fc.integer({ min: -400, max: 400 }),
});
const streamArb = fc.array(inputArb, { minLength: 1, maxLength: 300 });
const seedArb = fc.integer({ min: 0, max: 0xffffffff });

test('invariants hold for random input streams', () => {
  fc.assert(
    fc.property(seedArb, streamArb, (seed, stream) => {
      const s = createState(seed);
      let last = 0;
      for (const inp of stream) {
        step(s, inp);
        const sp = spine(seed >>> 0, s.z, CANYON);
        if (!(s.y <= sp.ceilY - C.CEIL_MARGIN + 1e-9)) return false;
        const n = Math.sqrt(s.qx * s.qx + s.qy * s.qy + s.qz * s.qz + s.qw * s.qw);
        if (Math.abs(n - 1) > 1e-12) return false;
        if (!(s.speed >= C.MIN_SPEED * 0.6 && s.speed <= C.MAX_SPEED + C.OVERSPEED_MARGIN))
          return false;
        if (s.score < last || !Number.isInteger(s.score)) return false;
        last = s.score;
        if (!(s.proximity >= 0 && s.proximity <= 1)) return false;
        if (Number.isNaN(s.x + s.y + s.z + s.qx + s.qy + s.qz + s.qw + s.speed)) return false;
      }
      return true;
    }),
    { numRuns: 150 },
  );
});

test('stepping a mid-run clone equals stepping the original', () => {
  fc.assert(
    fc.property(seedArb, streamArb, (seed, stream) => {
      const a = createState(seed);
      const b = createState(seed);
      for (const inp of stream) step(a, inp);
      const snap = cloneState(a);
      for (const inp of stream) {
        step(a, inp);
        step(snap, inp);
        step(b, inp);
      }
      for (const inp of stream) step(b, inp);
      return checksum(a) === checksum(snap) && checksum(a) === checksum(b);
    }),
    { numRuns: 60 },
  );
  expect(true).toBe(true);
});
