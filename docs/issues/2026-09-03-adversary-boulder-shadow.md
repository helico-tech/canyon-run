---
status: triaged
priority: P3
filed: 2026-09-03
filed-by: agent
work: CR-0045
---
# Adversary: hoodoo boulder shadow that tracks the plane in x

## Observation

A hoodoo boulder hanging from the ceiling whose x follows the plane's x with a
lag, so it is only ever avoided by a late jink. Motion would depend on the
plane's state like CLOSE does today (approach-driven), which keeps it
deterministic. Fairness needs a maximum tracking speed below the plane's
lateral speed and a lane check the audit cannot do statically; a
plane-in-the-loop audit variant is required first.

From the EPIC-10 research (`docs/research/2026-09-03-06-adversaries-design.md`).

## Resolution
