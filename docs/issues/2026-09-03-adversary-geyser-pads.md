---
status: resolved
priority: P3
filed: 2026-09-03
filed-by: agent
work: CR-0044
---
# Adversary: lava geyser pads that erupt on a rhythm

## Observation

Lava pads on the rift floor that erupt on a rhythm as a column reaching the
core, telegraphed by a glow ramp two seconds ahead. In the station model this is
a vertical sweep from below with a long dwell at the bottom: ampY reaches the
core, the wave is a pulse, not a triangle. The audit's reachability rule covers
it once the pulse dwell is longer than the plane's crossing.

From the EPIC-10 research (`docs/research/2026-09-03-06-adversaries-design.md`).

## Resolution

**Resolved 2026-09-03** in CR-0044, commit 2e53518. MOTION_ERUPT column (archetype 8) in the lava rift; rise under 0.9 u per tick.
