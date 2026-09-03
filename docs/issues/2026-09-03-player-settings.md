---
status: resolved
priority: P3
filed: 2026-09-03
filed-by: agent
work: CR-0041
---
# Settings: mouse sensitivity, invert Y, throttle on W/S

## Observation


## Resolution
Research 05 proposed a sensitivity slider (0.5-2x), invert Y and an alternative throttle mapping, persisted in localStorage. Sensitivity must stay a sim constant per replay (store it in the replay header) so validation remains exact.

**Resolved 2026-09-03** in CR-0041, commit 0627e33. Settings as app-side input transforms (ADR 0008); start-screen controls; tests.
