---
id: CR-0030
epic: EPIC-09
status: done
---
# CR-0030 Biome selector

**Goal.** Choose a biome on the start screen (auto, canyon only, or one
special for every odd segment), carried in the URL hash and in replays so runs
stay reproducible and shareable.

**Files.** `src/terrain/biomes.ts` (`biomeForSegment(seed, index, mode)`),
`src/sim/state.ts` (`biomeMode`, hashed), `src/sim/replay.ts` (header field,
validation), `src/app/screens.ts` (select), `src/app/seed.ts` (`#biome=`),
`src/app/hud.ts` (label), worker seed message, CLI `--biome`, tests, docs.

**Acceptance.**
- `biomeMode` is part of the state checksum and the replay header; a replay
  with a different mode is rejected as version-mismatch.
- URL `#seed=…&biome=trench` loads that mode; the run-over panel and HUD show it.
- Goldens unchanged for mode 0 (auto).

**Verification.** `pnpm check`, `pnpm test:e2e`, a headless sheet per mode.

**Delivered notes.** `biomeMode` flows through biome selection, field
context, chunk builder, worker seed message, sim state (hashed), scratch,
pilot, replay header, game options, URL hash, start-screen select, HUD label,
CLI `--biome` and headless `--biome`. Auto mode output is bit-identical to
before. Evidence in `docs/evidence/2026-09-03-CR-0030/`.
