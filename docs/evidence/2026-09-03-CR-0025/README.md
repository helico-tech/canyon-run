# CR-0025 evidence — death sequence

Test mode on seed 1: after 200 pilot ticks the plane is teleported 200 u into
the wall and stepped once (`alive = 0`), then screenshots at 0, 12 and 36 ticks
after death:

- `death-t0.png`: white flash, CRASHED banner, hitstop (camera holds).
- `death-t12.png`: 48 shards bursting from the crash point, camera tumbling and
  drifting with the decaying velocity, canvas desaturating.
- `death-t36.png`: shards dispersing and fading.

The timeline is driven by sim ticks (they keep counting while dead), so the
frames are deterministic. Zero page errors; all eight Playwright specs pass.
