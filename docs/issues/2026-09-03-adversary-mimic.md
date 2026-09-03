---
status: resolved
priority: P3
filed: 2026-09-03
filed-by: agent
work: CR-0045
---
# Adversary: archipelago mimic that copies the plane's offset with a lag

## Observation

An archipelago shard that copies the plane's cross-section offset with a delay
so the pilot must move at the last moment. Same plane-in-the-loop dependency as
the boulder shadow; both share one audit extension. Decide after playtesting
whether reactive bodies read as fair from the cockpit.

From the EPIC-10 research (`docs/research/2026-09-03-06-adversaries-design.md`).

## Resolution

**Resolved 2026-09-03** in CR-0045, commit 577cdba. MOTION_AIM: mirror, lock at closeDist, hold; audit over lock positions; flights green.
