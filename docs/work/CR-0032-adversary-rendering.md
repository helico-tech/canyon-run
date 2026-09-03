---
id: CR-0032
epic: EPIC-10
status: done
---
# CR-0032 Adversary rendering: instanced bodies, telegraph cores, station frames

**Goal.**

**Files.**

**Acceptance.**
-

**Verification.**
**Scope.** `src/render/adversaries.ts`, renderer and null-renderer hooks, `Game.render` wiring, HudProbe min with adversaries, test API `adversaries()`. Verified with a headless run using a temporary forced parameter set (test-only) and a pixel probe on a body's projected position.

**Acceptance.** Bodies drawn where the sim has them at integer ticks (probe within 2 px); telegraph core pulses; frames fade in from 400 u; zero console errors; frame hashes deterministic.

**Delivered notes.** Scope grew to include the per-biome adversary sets (moved
from CR-0033 so there was something to render). Bodies are unlit
(`MeshBasicMaterial`) in the accent, breathing toward white over their period;
the inner "core" instance of the design was dropped because it was hidden
inside the body. Placement learned three rules while tuning: wall and floor
margins derive from each biome's noise amplitudes (a noise-free trench needs
almost none), jaws must open at least 8 u wider than their minimum gap, and
bodies that cross the core from segment 1 are clamped thin enough to leave a
hull-sized free disc beside them (a unit test asserts the free disc at every
tick of every station in segments 0–3). Goldens regenerated (SIM_VERSION 0.1.12).
