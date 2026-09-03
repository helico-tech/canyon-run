# Scoring

Computed inside the tick in integer milli-points so replay validation covers it.

```
sf     = clamp((speed − 50) / 120, 0, 1)
rate   = 0.2 + 0.8 · sf²                    slow flight earns a fifth of full rate
points = floor(1000 · rate · (1 + 1.0 · proximity))
score += points
```

- Survival time is implicit: points accrue every tick while alive.
- Slowing down costs points quadratically; diving past `MAX_SPEED` clamps `sf`
  at 1, so overspeed is not an exploit.
- Hugging rock (proximity → 1) doubles the rate. The ceiling zone earns nothing
  extra because the roof is far from the probe unless the plane is pushed into it.
- `score / 1000` reads as "seconds at full speed".

- Passing a biome gate (segment boundary) adds `GATE_BONUS = 1 500 000` milli-points (CR-0022), once per segment: the highest segment paid is latched in the state (`gateSeg`, hashed), so looping back through a gate pays nothing (CR-0035).
- The enforced speed floor rises per segment (docs/domain/difficulty.md); `sf` keeps the constant reference so scores stay comparable.

## Near misses and streak (CR-0024)

```
near     = −d(centre)                      metres to rock
streak   = ticks continuously within 10 u (45-tick grace before it resets), capped at 120
rate    *= 1 + proximity + 0.5 · streak/120
CLOSE    = a pass with near < 3 u for ≥ 5 ticks that then ends, at speed factor > 0.5   +250 000
SO CLOSE = the same pass with a minimum distance under 1.5 u                            +750 000
THREADED = rock within 6 u of both lateral probes (±8 u) for 3 ticks                   +500 000
GATE     = first crossing into a new segment (latched, never repeats)                +1 500 000
DODGED   = crossing an adversary station's plane at speed with a body within 6 u      +400 000
```

Events other than GATE share a 36-tick cooldown. The last event (`eventId`,
`eventTick`, `eventPoints`) lives in the state and is hashed, so callouts are
part of the replay; the HUD shows them as rising text.
