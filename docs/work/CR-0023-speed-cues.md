---
id: CR-0023
epic: EPIC-07
status: done
---
# CR-0023 Speed cues: FOV, streaks, vignette, lean and shake

**Goal.** The render reads as fast: `fov = 66 + 18·t_v`, 300-segment streak tube, CSS vignette, spring-damped camera lean, proximity shake clamped to 1.5°.

**Files.** `src/render/camera.ts`, `src/render/streaks.ts`, `src/render/shake.ts` (render-side noise, own PRNG), `src/app/hud.css` (vignette), tests for the spring (pure), `docs/domain/game-feel.md`.

**Acceptance.** Sim checksums unchanged (render-only). Streaks invisible below `t_v = 0.2`. Headless sheet at min and max speed shows the difference. Frame gate still passes.

**Verification.** `pnpm check`, goldens unchanged, sheet in `docs/evidence/`.

**Delivered notes.** Camera lean comes straight from the sim's filtered rates
(no extra spring: the rates are already first-order filtered). Streak scroll
and shake noise are driven by the sim tick, so headless frames stay
deterministic. Evidence in `docs/evidence/2026-09-03-CR-0023/`.
