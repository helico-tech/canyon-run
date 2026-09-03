---
status: triaged
priority: P2
filed: 2026-09-03
filed-by: agent
work: CR-0035
---
# GATE bonus pays on every forward re-crossing of a segment boundary

## Observation

`src/sim/step.ts` pays GATE_BONUS whenever `segmentAt(z).index > segBefore`, and
nothing stops the plane flying backwards. A loop through a boundary inside the
75 u clear zone pays 1 500 000 per pass and the replay validates as ok, so bests
are farmable. Fix: latch the highest segment reached in the state (hashed) and
pay only when it increases; regold. Add a test that a backwards loop pays once.
Reported by the code-review sweep (angle B).


## Resolution
