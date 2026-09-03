---
status: open
priority: P2
filed: 2026-09-03
filed-by: agent
---
# Storage.read() does not validate shapes; a corrupt canyon.runs kills the render loop

## Observation

`src/app/storage.ts` parses localStorage inside try/catch but returns whatever
parsed. A `canyon.runs` value that is not an array makes `[run, ...runs()]`
throw in `recordRun()` inside the rAF frame, so the loop stops: HUD frozen, no
run-over panel. A non-object `canyon.best` makes the best never update again.
Fix: `Array.isArray` and field checks in `read()`, fall back to the empty value.
Reported by the code-review sweep (angle B).


## Resolution
