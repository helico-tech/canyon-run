# Difficulty and gates

Source: `src/terrain/difficulty.ts`, `src/terrain/biomes.ts` (`applyDifficulty`),
`src/terrain/features.ts` (gate, clear zone), `src/sim/constants.ts` (`SPEED_FLOOR`).

Everything is a literal table indexed by the segment (hub 1200 u, special
2400 u, alternating), so no `exp` runs at play time and replays stay exact.

| Segment | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9+ |
|---|---|---|---|---|---|---|---|---|---|---|
| width × | 1.0 | 0.95 | 0.9 | 0.85 | 0.8 | 0.76 | 0.72 | 0.68 | 0.64 | 0.6 |
| feature probability × (cap 0.95) | 0.5 | 0.65 | 0.8 | 0.9 | 1.0 | 1.1 | 1.2 | 1.3 | 1.4 | 1.5 |
| roughness × (ridges, detail) | 0.7 | 0.8 | 0.9 | 1.0 | 1.1 | 1.2 | 1.3 | 1.4 | 1.5 | 1.6 |
| speed floor (u/s) | 50 | 54 | 58 | 62 | 66 | 70 | 74 | 78 | 82 | 86 → 90 |

The core tube radius is never scaled, so every segment stays flyable. Blends
lerp the two segments' scaled parameters, so the difficulty step is as smooth
as the biome change.

## Gates

Each boundary carries a gate: two pillars at `±0.9·hw` from the centreline and a
lintel 22 u below the roof, radius 3 u, coloured with the **next** biome's
accent. A clear zone of 75 u on each side of the boundary has no other
features. Crossing the boundary while alive pays `GATE_BONUS` (1 500 000
milli-points, i.e. 25 s of full-rate flight) inside the sim, so it replays.
