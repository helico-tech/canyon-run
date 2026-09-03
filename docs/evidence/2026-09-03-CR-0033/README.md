# CR-0033 evidence — fairness audit and the dodging pilot (2026-09-03)

- `audit-seeds-1-8.txt`: `pnpm adv:audit --seeds 1-8 --length 10000`. Every
  station of seeds 1–8 (auto mode over 10 000 u, plus every forced biome for
  seeds 1–3 over 10 000 u) passes the speed bound, the z-depth rule, the free
  hull position at every tick and the reachability under 1 u per tick. The
  dodging pilot then flies seeds 1–8 at full throttle to 10 000 u: all alive.
- `forced-biomes-seeds-1-3.txt`: the same pilot in every forced biome
  (canyon, cave, crystal spires, lava rift, hoodoo desert, floating
  archipelago, trench run) on seeds 1–3 to 8 000 u: all alive.

What the audit caught while it was being written, all fixed in this unit:
spinning blades crossing the cave core (no lane at some phase), lava pistons
crossing a 24 u core (a 1.5 u lane at best), hoops drifting their opening off
the core late in a run, and a pilot that measured its dodge offsets from the
body's own centre instead of the core.
