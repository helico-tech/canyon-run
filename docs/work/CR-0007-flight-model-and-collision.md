---
id: CR-0007
epic: EPIC-03
status: done
---
# CR-0007 Flight model, collision, scoring

**Goal.** `step(state, input, C)` per spec §5.3, pure and deterministic.

**Files.** `src/sim/constants.ts` (`C`, `hashConstants`), `src/sim/state.ts` (`SimState`, `createState(seed)`, `cloneState`, `checksum`), `src/sim/quat.ts` (`rotate`, `mul`, `normalize`, `basis`), `src/sim/input.ts` (`KEY` bits, `InputFrame`, `ZERO_INPUT`), `src/sim/step.ts`, `src/sim/collision.ts` (hull probes, sub-steps, proximity), tests incl. `src/sim/step.property.test.ts` (fast-check), `docs/domain/flight-model.md`, `docs/domain/scoring.md`.

**Acceptance.**
- Sign tests: `PITCH_UP` raises `forward.y`; `ROLL_R` makes `right.y < 0`; `YAW_R` moves forward toward right (`-X`); `THR_UP` raises speed.
- Invariants (property, 300 runs × 600 ticks): `y ≤ ceilY(z) − CEIL_MARGIN`, unit quaternion within 1e-12, `0.6·MIN ≤ speed ≤ MAX + 30`, integer non-decreasing score, no NaN, stepping a clone equals stepping the original.
- A straight flight from the start position survives ≥ 600 ticks on seed 1 (the core tube reaches the sim).
- Teleporting the plane into rock sets `alive = 0` within one tick.
- Throughput logged (target ≥ 200 k ticks/s in Node; not asserted).

**Verification.** `pnpm check`.

**Delivered notes.** The scripted pilot moved here from CR-0008 because a
straight flight cannot survive (the spine wanders 80 u); tests fly with the
pilot instead. Ghost mode on `StepScratch` disables hull collision for
orientation-only tests. The ceiling is clamped against the spine at the tick's
end z, so the invariant holds exactly. `SimState.proximity` was added to the
checksum.
