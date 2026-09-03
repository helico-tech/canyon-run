---
id: CR-0013
epic: EPIC-05
status: todo
---
# CR-0013 HUD

**Goal.** Minimal cockpit HUD as a DOM overlay per research 05 §3.

**Files.** `src/app/hud.ts` (`createHud(root)`, `update(state, view)` with transforms only, text at 15 Hz), `src/app/hud.css`, `index.html`.

**Elements.** Score + live multiplier (top centre), speed bar + number (bottom left), altitude bar with ceiling red zone (right), artificial horizon line + reticle (centre), four proximity edge glows, seed (bottom right), replay badge (top left, only when replaying).

**Acceptance.**
- HUD probe pixels in the gate (speed bar fill colour at a fixed point, score text region non-background).
- HUD never reads sim internals other than `SimState` and the render view (fov, t_v).
- No layout thrash: updates use `transform` and `textContent` only.

**Verification.** headless sheet with HUD visible in `docs/evidence/2026-09-03-CR-0013/`; `pnpm test:e2e`.
