---
id: CR-0025
epic: EPIC-07
status: todo
---
# CR-0025 Death sequence

**Goal.** Collision → 90 ms hitstop, white flash, 48 flat-shaded shards (`InstancedMesh`), camera tumble, desaturate, panel at 600 ms.

**Files.** `src/render/shards.ts`, `src/app/game.ts` (death timeline driven by render clock, sim frozen), `src/app/hud.css`, `docs/domain/game-feel.md`.

**Acceptance.** Sim state after death is unchanged by the effect (checksum stable). Headless: three frames after a forced collision show flash → shards → panel (sheet in `docs/evidence/`).

**Verification.** `pnpm check`, `pnpm test:e2e`.
