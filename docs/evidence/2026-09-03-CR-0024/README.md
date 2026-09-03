# CR-0024 evidence — near-miss events and callouts

`callout-threaded.png`: test mode on seed 1, the plane teleported (ghost
collision) into a 1 u gap beside the wall for seven ticks and then back to the
core: the sim fired THREADED (+500) and the HUD shows the rising callout under
the reticle. Regenerated goldens show the pilot itself earning events: seed 1
went from 5 594 880 to 6 109 337 milli-points, seed 3 from 5 295 030 to 6 295 030.

All eight Playwright specs pass on this build.
