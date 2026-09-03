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

Event bonuses (near misses, gates) come in CR-0024 and CR-0022.
