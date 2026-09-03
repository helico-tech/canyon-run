---
id: CR-0009
epic: EPIC-04
status: todo
---
# CR-0009 Render bootstrap and test mode

**Goal.** The first real frame: chunks built in-thread around the start position, sky dome, fog, lights, camera at the start pose, `window.__game` test API, headless screenshot committed as evidence.

**Files.** `src/render/renderer.ts` (`createRenderer(canvas, opts)`, `render(pose, alpha)`), `src/render/chunkMesh.ts` (`ChunkMesh → BufferGeometry` with u8 normalised colour, mesh position = chunk origin, dispose), `src/render/sky.ts` (dome `ShaderMaterial`), `src/render/camera.ts` (pose → three camera incl. the 180° yaw, fov from speed), `src/render/palette.ts` (fog/sky/light colours per biome; canyon only), `src/app/testMode.ts` (`window.__game`, `window.__info`), `src/app/main.ts`, `index.html`, `docs/context/headless-validation.md`, `docs/evidence/2026-09-03-CR-0009/`.

**Acceptance.**
- `?test=1` renders one frame without a rAF loop; `__game.frameHash()` is stable across two loads; `__game.readPixel` at top-centre is the sky horizon colour ±3.
- Playwright screenshot shows canyon walls both sides, floor below, fog to the horizon; the agent reads the PNG and confirms.
- Zero console errors apart from the SwiftShader ReadPixels warning.

**Verification.** `pnpm build`, a `tools/headless/shot.ts` script producing `docs/evidence/2026-09-03-CR-0009/start.png`.
