---
status: triaged
priority: P2
filed: 2026-09-03
filed-by: agent
work: CR-0047
---
# Verify frame rate and pointer lock in a real browser on a GPU

## Observation


## Resolution
All rendering evidence comes from headless SwiftShader on a VM without a GPU (25-45 ms per frame at 640x360, validation-grade). Pointer lock cannot be exercised headless. Someone with a display should confirm 60 fps at 1080p with ~200k resident triangles, mouse feel (sensitivity 0.02 per count, auto-level), and that Esc releases the lock cleanly. Tune constants in src/sim/constants.ts if needed (changes the constants hash: regold).

## Progress (2026-09-03, CR-0047)

This cannot be closed from the build VM (no display, no GPU). Done from
here: a frame-rate readout in the HUD under `?debug=1`, the step-by-step
`docs/context/real-display-checklist.md`, and headless coverage of the
keyboard path, the pointer-lock request and its release. What remains is a
person following the checklist on a real display and appending the result
below, then resolving this issue.
