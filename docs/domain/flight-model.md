# Flight model

Source: `src/sim/{constants,step,quat,collision,state}.ts`. Decision: ADR 0002.

## Frames and signs

- World: Y up, flight axis +Z. Body at identity: forward +Z, up +Y, right −X.
- Commands: +roll = roll right, +pitch = nose up, +yaw = yaw right.
- Body angular velocity `ω = (−pitchRate, −yawRate, +rollRate)`; unit tests pin
  the signs by checking basis vectors after 20 ticks of each key.

## Tick (60 Hz, `DT = 1/60`)

```
kRoll, kPitch, kYaw, kThr ∈ {−1, 0, 1} from key bits
cmdRoll  = clamp(kRoll  + dx·0.02, −1, 1)
cmdPitch = clamp(kPitch − dy·0.02, −1, 1)          mouse forward = nose down
if cmdRoll == 0: cmdRoll = clamp(right.y · 0.35)   auto-level
cmdYaw   = clamp(kYaw − right.y · 0.6)             bank-to-turn
ceiling  = ceilY(z) − 16; soft zone 20 below it pushes cmdPitch down by up to 2
rate    += (cmd·MAX_RATE + gust − rate) · 0.2      roll 3.5, pitch 1.75, yaw 0.7 rad/s
q        = normalize(q + q ⊗ (0.5·DT·ω, 0))
throttle = clamp(throttle + kThr/90, 0, 1)
target   = 50 + throttle·120
speed   += (target − speed)·0.03
speed    = clamp(speed − 20·forward.y·DT, 30, 200)  climbing bleeds, diving gains
p       += forward · speed · DT ;  y = min(y, ceiling)
```

`gust` draws from the sim PRNG every tick even while `TURBULENCE = 0`, so the
PRNG stream is always part of the checksummed state.

## Collision

Six hull probes (nose +3, tail −2, wings ±4, top +1, bottom −1 in body units)
are rotated by `q` and evaluated against the field at the midpoint and the end
of the tick's travel. `d > −0.4` (inside rock within tolerance) kills the plane.
At 200 u/s a tick moves 3.3 u, so two samples per tick keep the effective step
under one 2 u cell. Proximity is `clamp(−d(centre) / 25, 0, 1)`.

## Start

`x = cx(0)`, `y = coreY(0)`, `z = 0`, identity orientation, `speed = 50`,
`throttle = 0.5`.

## Scripted pilot (`src/sim/pilot.ts`)

The pilot stands in for a player in tests, golden replays and headless runs.
It is deterministic from its own seed and never touches the sim PRNG.

1. Desired forward vector = spine slope over `[z − 20, z + 60]` (feed-forward)
   plus `0.02 ×` the lateral and vertical offset from the core, normalised.
2. Desired world angular velocity `ω = 5 · (fwd × (desired − fwd))`, capped at 2 rad/s.
3. `ω` is projected onto the body axes: pitch command about the right vector,
   yaw command about −up (keys `YAW_L/R` when |cmd| > 0.35), and the plane
   banks into the turn (`right.y_target = −1.5 · yawRightRate`) so pitch
   authority turns the nose.
4. Mouse counts are rounded half-up (no `Math.round` in the core) and a small
   seeded jitter keeps replays realistic.

Sweep on 2026-09-03 over 8 seeds × 2400 ticks at full throttle: every gain
combination survived; the chosen gains keep the plane within ~2 u of the core.
An earlier pure-pursuit controller drifted 10 u and hit a pillar at seed 1,
z ≈ 187, which is how the projected-ω design came about.
