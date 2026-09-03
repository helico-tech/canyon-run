# Controls

Source: `src/app/{inputSampler,pointerLock,loop,main}.ts`. Sensitivity and rates
are sim constants (ADR 0002), so replays never depend on player settings.

| Input | Action | Sim bit |
|---|---|---|
| W / ArrowUp | nose down (push) | `PITCH_DOWN` |
| S / ArrowDown | nose up (pull) | `PITCH_UP` |
| A / ArrowLeft | roll left | `ROLL_L` |
| D / ArrowRight | roll right | `ROLL_R` |
| Q / E | yaw left / right | `YAW_L` / `YAW_R` |
| Shift | throttle up | `THR_UP` |
| Ctrl | throttle down | `THR_DOWN` |
| Mouse X / Y (pointer lock) | roll / pitch, 1 count = 2 % of full deflection | `dx` / `dy` |
| Click on canvas | request pointer lock (`unadjustedMovement` when available) | |
| Esc | browser releases pointer lock; held keys are dropped | |

Keys are latched per tick (a tap between two ticks counts once); mouse deltas
accumulate and are rounded to integers, clamped to int16, and sub-pixel jitter
below 1 px is ignored. Window blur and losing pointer lock release all keys.

## Loop

`advance(acc, elapsedMs)` clamps a frame to 250 ms, runs at most 5 ticks per
frame and drops the backlog beyond that. The renderer interpolates between the
previous and current sim state with `alpha = acc / tickMs` (position lerp,
orientation nlerp). Test mode and the headless tools call the same `Game.step`
path with scripted or replayed inputs.

## Settings (CR-0041, ADR 0008)

The start screen has a sensitivity slider (0.5–2×), an invert-Y toggle and a
W/S-throttle toggle. All three are applied in the `InputSampler` before the
sim sees integer counts: the sim, its constants and replays are unaffected.
With W/S throttle on, W/S produce `THR_UP`/`THR_DOWN` and Shift/Ctrl produce
the pitch bits. Settings persist in localStorage (`canyon.settings`).
