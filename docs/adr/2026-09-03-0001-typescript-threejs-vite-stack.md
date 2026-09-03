---
status: accepted
date: 2026-09-03
deciders: agent (autonomous mandate from the project owner)
---

# 0001: TypeScript + three.js + Vite, headless via Playwright Chromium

## Context

Canyon Run needs desktop and web reach, a low memory and CPU footprint,
newcomer-simple install and run, and — the hard requirement — an AI agent must be
able to run the game headless on this machine, drive it, and read back pixels to
validate rendering. Five stacks were researched and probed on this box
(see `docs/research/2026-09-03-01-rendering-stack.md`).

Weighted ranking (8 criteria, headless capture weighted heaviest):

| Rank | Stack | Score | Headless on this box |
|---|---|---|---|
| 1 | three.js 0.185 + TypeScript 7 + Vite 8 | 4.50 | proven, zero flags (SwiftShader) |
| 2 | raw WebGL2 + twgl/ogl | 4.35 | same as 1 |
| 3 | Rust wgpu 30 + winit 0.30 | 4.25 | proven, zero env vars (lavapipe / llvmpipe) |
| 4 | Rust glow + glutin EGL | 3.85 | not probed |
| 5 | Browser WebGPU | 3.60 | flags + secure origin only |
| 6 | macroquad | 3.45 | fails: needs X11/Wayland |
| 7–8 | sokol (Rust / Zig) | 3.10 | needs a display |

## Decision

- **Language and build:** TypeScript, Vite, pnpm. One package, no monorepo.
- **Rendering:** three.js. The renderer is an adapter behind a small port; the
  simulation and terrain modules never import it.
- **Headless validation:** Playwright Chromium. WebGL2 renders through
  ANGLE → SwiftShader with no flags; frames are bit-identical across runs.
- **Desktop** means the same build opened in a local browser (or installed as a
  PWA). No Electron or Tauri shell. A native shell can be added later without
  touching game code.
- **Fallback:** Rust wgpu + winit, if a standalone executable or bit-exact
  native/web replay ever becomes a hard requirement.

## Consequences

- Install is `pnpm install`, run is `pnpm dev`, tests are `pnpm test`. No native toolchain.
- The game's own heap is a few MB; the browser is the footprint. That is accepted
  for a web target.
- Bundle ~130 KB gzipped. Acceptable; raw WebGL2 would save ~100 KB at the
  cost of hand-written camera, culling, and material code.
- three.js is pinned to an exact version; upgrades are deliberate and re-baseline
  golden frame hashes (see [[0003]]).
- Sim determinism does not come from the stack; it comes from the discipline in
  `docs/adr/2026-09-03-0002-transcendental-free-sim-core.md`.
