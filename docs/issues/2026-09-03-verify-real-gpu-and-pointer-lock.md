---
status: open
priority: P2
filed: 2026-09-03
filed-by: agent
---
# Verify frame rate and pointer lock in a real browser on a GPU

## Observation


## Resolution
All rendering evidence comes from headless SwiftShader on a VM without a GPU (25-45 ms per frame at 640x360, validation-grade). Pointer lock cannot be exercised headless. Someone with a display should confirm 60 fps at 1080p with ~200k resident triangles, mouse feel (sensitivity 0.02 per count, auto-level), and that Esc releases the lock cleanly. Tune constants in src/sim/constants.ts if needed (changes the constants hash: regold).
