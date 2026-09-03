---
status: resolved
priority: P3
filed: 2026-09-03
filed-by: agent
work: CR-0042
---
# Procedural audio: engine hum, wind, callout blips

## Observation


## Resolution
Out of scope for v1. Research 05 section 7 has a 60-line WebAudio recipe (detuned sawtooth engine, bandpass wind by speed factor, blips for events). Resume the AudioContext on the same click that requests pointer lock.

**Resolved 2026-09-03** in CR-0042, commit e5a5293. WebAudio engine, wind, blips, thud; sound toggle; stub-context tests.
