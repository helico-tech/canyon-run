---
id: CR-0032
epic: EPIC-10
status: todo
---
# CR-0032 Adversary rendering: instanced bodies, telegraph cores, station frames

**Goal.**

**Files.**

**Acceptance.**
-

**Verification.**
**Scope.** `src/render/adversaries.ts`, renderer and null-renderer hooks, `Game.render` wiring, HudProbe min with adversaries, test API `adversaries()`. Verified with a headless run using a temporary forced parameter set (test-only) and a pixel probe on a body's projected position.

**Acceptance.** Bodies drawn where the sim has them at integer ticks (probe within 2 px); telegraph core pulses; frames fade in from 400 u; zero console errors; frame hashes deterministic.
