# HUD

Source: `src/app/{hud,hud.css,hudProbe}.ts`. A DOM overlay over the canvas;
only transforms, opacity and (at 15 Hz) text change, so there is no layout thrash.

```
+------------------------------------------------------------------+
| [replay 1800 ticks]            128 450                     |    | |
|  (only when replaying)         x 2.4                       |####| |  <- red ceiling zone (top 18 %)
|                                                            |    | |
|                    ~~~~~ artificial horizon ~~~~~          |  = | |  <- altitude marker
|                              ( • )  reticle                |    | |
|                                                            |    | |
|  SPEED                                              seed 0000-0001 |
|  [######----] 132                                                  |
+------------------------------------------------------------------+
  edge glows (left, right, top, bottom): opacity = proximity² per side
```

- **Score** is `floor(milli-points / 1000)`; the multiplier is the current
  rate `(0.2 + 0.8·sf²)·(1 + proximity)`.
- **Speed bar** fill = speed factor; the number is u/s.
- **Altitude bar**: marker at `(y − floorY) / (ceilingClamp − floorY)`; the red
  zone marks the soft-push band under the ceiling clamp.
- **Horizon** rotates by −bank and shifts by pitch (both from the quaternion
  basis on the render side, where `Math.atan2` is allowed).
- **Edge glows** sample the terrain field 8 u to the left, right, above and
  below the plane (`HudProbe`); they never feed back into the sim.
- **Seed** is shown as `XXXX-XXXX` hex; **replay** badge appears during playback;
  **CRASHED** appears when `alive = 0` (the run-over panel is CR-0014).

Headless runs capture page screenshots (canvas + HUD); the gate checks the
altitude bar's border pixel so a missing HUD fails the run.
