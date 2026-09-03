---
status: open
priority: P2
filed: 2026-09-03
filed-by: agent
---
# Hoodoo desert and archipelago exceed one worker's budget at top speed

## Observation


## Resolution
Census (docs/context/performance.md, 2026-09-03): the hoodoo desert costs
~390 ms per slab and the archipelago ~430 ms, versus 185 ms for the canyon.
At 170 u/s the plane consumes 2.65 slabs/s, so one JS worker falls behind in
those biomes and the ring drains during a 2400 u special segment. Options:
a second worker (even/odd slabs), a wasm port of the field (research 03
measured 2.9×), fewer candidates via a tighter envelope, or 2.5 u cells in
wide halls. Pick up in CR-0027 (performance pass).
