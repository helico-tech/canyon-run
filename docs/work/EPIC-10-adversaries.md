---
id: EPIC-10
status: done
---
# EPIC-10 Adversaries

Owner request: adversaries that fit each biome and move only in the
cross-section plane. Research in `docs/research/2026-09-03-06…` and `…-07…`,
decision ADR 0007, design `docs/specs/2026-09-03-adversaries.md`.

Stories: CR-0031, CR-0032, CR-0033, CR-0034.

## Outcome (2026-09-03)

Seven archetypes over four shapes and six motion laws, one set per biome,
posed in closed form so replays carry no extra state. Fairness holds by
construction (placement rules) and by proof (`pnpm adv:audit`), and the
dodging pilot survives every seed and biome tried. Evidence per story under
`docs/evidence/2026-09-03-CR-003x/`; domain notes in `docs/domain/adversaries.md`.
Follow-up kinds (crystal iris, geyser pads, boulder shadow, mimic) are filed as
P3 issues; the reactive ones need a plane-in-the-loop audit first.
