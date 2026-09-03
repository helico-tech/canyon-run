---
id: CR-0023
epic: EPIC-07
status: todo
---
# CR-0023 Speed cues: FOV, streaks, vignette, lean and shake

**Goal.** The render reads as fast: `fov = 66 + 18·t_v`, 300-segment streak tube, CSS vignette, spring-damped camera lean, proximity shake clamped to 1.5°.

**Files.** `src/render/camera.ts`, `src/render/streaks.ts`, `src/render/shake.ts` (render-side noise, own PRNG), `src/app/hud.css` (vignette), tests for the spring (pure), `docs/domain/game-feel.md`.

**Acceptance.** Sim checksums unchanged (render-only). Streaks invisible below `t_v = 0.2`. Headless sheet at min and max speed shows the difference. Frame gate still passes.

**Verification.** `pnpm check`, goldens unchanged, sheet in `docs/evidence/`.
