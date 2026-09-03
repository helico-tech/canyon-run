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

- Passing a biome gate (segment boundary) adds `GATE_BONUS = 1 500 000` milli-points (CR-0022).
- The enforced speed floor rises per segment (docs/domain/difficulty.md); `sf` keeps the constant reference so scores stay comparable.

Near-miss events come in CR-0024.
