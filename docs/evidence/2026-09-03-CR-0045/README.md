# CR-0045 evidence — aimed adversaries: boulder shadow and mimic (2026-09-03)

Both kinds share one law: the body mirrors the plane's cross-section position
while far, locks on the first tick inside `closeDist`, then holds. They
appear from segment 4 (z ≥ 7200), so the runs skip deep into the world.

- `boulder-shadow-hoodoo.png` (`--seed 6 --biome hoodoo-desert --skip 3150
  --frames 250 --every 25`): boulders at z 7861 and 8010. At f75 the blue slab
  sits by the reticle under its frame (mirroring); by f100 it has locked and
  the plane has moved off it; f175–f200 the second slab holds high while the
  plane passes below, and a DODGED callout follows.
- `mimic-archipelago.png` (`--seed 2 --biome floating-archipelago --skip 2900
  --frames 160 --every 20`): the pink shard mirrors the plane inside its frame
  (f100) and, once locked, stays put below the reticle as the plane climbs
  over it (f120).
- `*-gate.json`: every gate ok, browser checksum equal to Node.

Found on the way: on the crossing tick the passed station lost its lock to
the next one and snapped back onto the plane (the audit's static rule cannot
see this; the full-throttle flight of seed 4 did). The lock now persists until
the station is out of the collision band. Audit ok for seeds 1–8; all 21
forced-biome flights alive.
