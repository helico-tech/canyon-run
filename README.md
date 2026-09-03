# Canyon Run

A fast, colorful first-person canyon flyer. You pilot a plane at high speed
through an endless, procedurally generated canyon built from flat-shaded
marching-cubes terrain. Roll, pitch, yaw, and thrust are yours; the ceiling
is not. Survive as long as you can — slowing down costs points.

The simulation is deterministic: a run is fully described by a seed and the
per-tick input stream, so any run can be replayed and its score validated.

## Status

Research and architecture phase. See `docs/` for the decision record.

## Repository layout

```
docs/
  adr/       decisions and their rationale (dated, sequenced)
  specs/     designs, written before implementation (dated)
  work/      units of work (epics and stories, sorted by ID)
  issues/    issue queue: open, resolved, and why (dated)
  domain/    domain knowledge (terrain, flight model, scoring)
  context/   project context (toolchain, headless validation)
  research/  consolidated research reports that fed the ADRs
```
