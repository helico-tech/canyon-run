---
status: resolved
priority: P3
filed: 2026-09-03
filed-by: agent
work: CR-0037
---
# Game.loadReplay feeds every decoded run; Node stops at replay.ticks

## Observation

`src/app/game.ts` decodes all runs into the input source while `simulateReplay`
stops at `ticks` and only requires `runsLength >= ticks`. A replay with trailing
extra runs validates ok in Node yet flies differently in the browser after the
last counted tick. Fix: stop feeding input at `replay.ticks` (ZERO_INPUT after),
mirroring the validator. Reported by the code-review sweep (angle B).


## Resolution

**Resolved 2026-09-03** in CR-0037, commit debca36. replaySource bounds playback to ticks; test added.
