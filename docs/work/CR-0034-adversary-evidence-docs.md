---
id: CR-0034
epic: EPIC-10
status: done
---
# CR-0034 Adversary evidence sheets, docs and tuning pass

**Goal.** Ship the evidence and the documentation for EPIC-10: one headless
contact sheet per biome with all gates ok against the freshly built bundle,
a domain note on adversaries, the README line, and the follow-up kinds filed
as issues so the epic can close.

**Files.** `docs/evidence/2026-09-03-CR-0034/` (seven sheets and a README),
`docs/domain/adversaries.md`, `docs/domain/biomes.md` (cross-reference),
`README.md` (play section), `docs/issues/2026-09-03-adversary-*.md` (four
P3 follow-ups), `docs/work/EPIC-10-adversaries.md` (closed with an outcome).

**Verification.** `node tools/headless/run.ts --seed 1 --biome <b> --skip 300
--frames 300 --every 30` for each of the seven biomes: every gate ok, browser
checksum equal to Node. The first pass ran against a stale bundle and failed
the checksum gate in three biomes, which is the gate doing its job: rebuild,
then rerun. `pnpm check` green.
**Scope.** Headless contact sheets at stations in every biome (before/after), `docs/domain/adversaries.md`, scoring and difficulty doc updates, README line, evidence folder; tune amplitudes or probabilities where a sheet shows an unreadable or unfair station.

**Acceptance.** One sheet per biome committed with all gates ok; docs shipped; open issues filed for follow-up kinds (iris, geyser pads, boulder shadow, mimic).
