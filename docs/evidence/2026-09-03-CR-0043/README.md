# CR-0043 evidence — crystal iris (2026-09-03)

Forced crystal spires, seed 2 (`--biome crystal-spires --seed 2`).

- `iris-segment-0.png` (`--skip 300 --frames 200 --every 25`): the iris at
  z 962 before segment 4 breathes but its closed opening still clears the
  core; it grows from a ring with its station frame (f0–f50) and the plane
  flies through.
- `iris-segment-4.png` (`--skip 2100 --frames 200 --every 25`): the iris at
  z 5372 closes to a hull-sized opening; at f25 (26 u out) it fills the view
  and the pilot, centred, passes it alive.
- `iris-segment-4-gate.json`: every gate ok, browser checksum equal to Node.

Fairness: `pnpm adv:audit` for the forced spires passes (the radius change
now counts toward the speed bound), and the adversary tests assert the
radius range and a clear centre at every tick.
