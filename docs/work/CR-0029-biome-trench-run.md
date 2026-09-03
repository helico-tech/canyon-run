---
id: CR-0029
epic: EPIC-09
status: done
---
# CR-0029 Biome: Death Star trench run

**Goal.** An artificial trench: dead-straight vertical walls, open to a black
starfield, greebled walls and floor (boxes), square towers, cross-trench beams
to fly under, grey panels with lit strips; harsh white light, thin dark haze.

**Files.** `src/terrain/biomes/trench.ts`, `src/terrain/params.ts` (`roofOpen`,
box/beam placement params), `src/terrain/features.ts` (`FEATURE_BOX`: rounded
boxes on the floor, on the walls and as beams), `src/terrain/field.ts` (open
roof), `src/render/sky.ts` (stars), `src/terrain/palette.ts` (stars flag),
registration, tests, `docs/domain/biomes.md`, evidence.

**Acceptance.**
- Core tube stays air through the biome and blends; the sim's ceiling clamp
  still bounds altitude (open roof means no rock above, not no ceiling).
- Boxes and beams never block the core; beams span the trench below the
  ceiling clamp so they can be flown under.
- Sky dome shows stars when the biome asks for them; hashed, deterministic.
- Headless sheet reviewed and committed; goldens regenerated.

**Verification.** `pnpm check`, headless sheet, `pnpm test:e2e`.

**Delivered notes.** New field capability `roofOpen` (no rock roof; the sim's
ceiling clamp still bounds altitude), a generic rounded-box feature
(`FEATURE_BOX`) used for floor and wall greebles, towers and cross beams, and
a hashed starfield in the sky shader (`stars` per palette, blended).
Goldens regenerated (SIM_VERSION 0.1.9). Evidence in `docs/evidence/2026-09-03-CR-0029/`.
