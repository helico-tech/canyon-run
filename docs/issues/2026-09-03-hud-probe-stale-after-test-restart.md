---
status: triaged
priority: P3
filed: 2026-09-03
filed-by: agent
work: CR-0038
---
# Test API restart(seed) leaves HudProbe on the previous seed

## Observation

`src/app/testMode.ts` restart and loadReplay change `game.state.seed`, but only
`main.ts`'s own applySeed rebuilds HudProbe and calls hud.setSeed. After
`__game.restart(2)` on a page loaded with seed 1 the edge glows and seed label
come from seed 1's field. Fix: route the test API through the same applySeed
path or make Game own the probe. Reported by the code-review sweep (angle C).


## Resolution
