# Run lifecycle

Source: `src/app/{game,main,screens,seed,storage}.ts`.

```
idle ──click / Enter──▶ running ──collision──▶ dead ──R / Enter──▶ running (same seed)
                                                     └──N────────▶ running (new seed)
```

- **Start screen** shows the seed (editable, `XXXX-XXXX` hex, plain hex or a
  number), the overall best, and the controls. Clicking anywhere (or Enter in
  the seed field) starts the run and requests pointer lock in the same gesture.
- **Seed sources**, in order: `?seed=` query, `#seed=` hash, last seed from
  storage, random. The hash is rewritten with the current seed so a link shares
  a canyon.
- **Death**: the sim freezes itself (`alive = 0`); the HUD shows CRASHED at
  once, input is disabled, the run is recorded, and the run-over panel appears
  after 600 ms with score, time, distance, top speed, best and seed.
- **Restart**: `R` (or Enter on the panel) restarts the same seed and keeps the
  chunk cache, so it is immediate; `N` picks a new seed and replaces the worker.
- **Storage** (`localStorage`, every access guarded): `canyon.best`,
  `canyon.best.<seed>`, `canyon.lastSeed`, `canyon.runs` (last ten summaries).
- Test mode skips the screens and starts running; `?debug=1` keeps the screens
  and exposes the state, which `tests/e2e/lifecycle.spec.ts` uses to force a
  crash by teleporting into the wall.
