---
id: CR-0035
epic: EPIC-05
status: done
---
# CR-0035 GATE bonus pays once per segment

**Goal.** Close the score exploit from issue
`2026-09-03-gate-bonus-repeats-on-recrossing`: the GATE bonus fired on every
forward crossing of a segment boundary, so a loop through a gate farmed
1 500 000 per pass with a replay that validated as ok.

**Files.** `src/sim/state.ts` (`gateSeg`, created, copied, hashed),
`src/sim/step.ts` (pay only when the segment index exceeds the latch),
`src/sim/step.test.ts` (re-crossing pays once), `docs/domain/scoring.md`,
goldens regenerated (new hashed field).

**Acceptance.**
- A ghost flight that crosses the 1200 u boundary, is put back before it and
  crosses again records exactly one GATE event.
- Checksums include the latch so replays cannot disagree on it.

**Verification.** The new test failed with two payouts before the change and
passes after; `pnpm check` green after `pnpm sim:regold`.
