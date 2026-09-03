# Rendering stack research: canyon flyer (desktop + web, headless-testable)

Date: 2026-09-03. Box: Ubuntu 24.04 VM, 8 cores, 15 GB, Virtio GPU (no HW accel),
Mesa 25.2.8 (llvmpipe GL 4.5, lavapipe Vulkan), no Xvfb, no DISPLAY.
All versions below were read from registry.npmjs.org / index.crates.io today, not from memory.

## 1. Recommendation (TL;DR)

**Primary: TypeScript + three.js r185 + Vite 8, sim in a DOM-free module, headless via Playwright Chromium (SwiftShader).**
Zero native toolchain, 3 s install, 1 s build, 129 KB gz bundle, headless WebGL2 render + pixel
readback proven on this box in ~0.6 s per run. "Desktop" = the same build opened in a local browser
(or a PWA install); no Electron/Tauri wrapper.

**Fallback: Rust wgpu 30 + winit 0.30 (native binary + wasm).** Also proven headless on this box on
both lavapipe (Vulkan) and llvmpipe (GL) with zero setup, 0.3 s per run, 160 MB RSS, no browser
involved. Pick this instead if a *true native* desktop binary (6 MB, ~50 MB RSS on real GPUs) or
bit-exact native/web determinism becomes a hard requirement.

The single factor that flips the decision is what "desktop" must mean: browser tab (three.js wins)
vs standalone executable (wgpu wins). Everything else is close.

## 2. Scoring

Weights sum to 1.0. Scores 1 (bad) to 5 (good).

| Criterion (weight) | A1 three.js | A2 raw WebGL2 + twgl/ogl | A3 WebGPU (web) | B1 wgpu+winit | B2 macroquad | B3 sokol-rust | C Zig+sokol | D glow+glutin EGL |
|---|---|---|---|---|---|---|---|---|
| Newcomer install/build/run (0.15) | 5 | 5 | 5 | 3 | 4 | 2 | 2 | 3 |
| Runtime mem/CPU, 200k tris @60fps (0.15) | 4 | 4 | 4 | 5 | 5 | 5 | 5 | 5 |
| Headless render + readback on THIS box (0.25) | 5 (probed) | 5 (probed) | 3 (probed, flags) | 5 (probed) | 1 (probed, fails) | 2 | 2 | 4 |
| Determinism pitfalls (0.10) | 3 | 3 | 3 | 4 | 4 | 4 | 4 | 4 |
| Testability: sim unit + image tests (0.10) | 5 | 5 | 4 | 4 | 3 | 3 | 3 | 4 |
| Desktop + web reach (0.10) | 4 | 4 | 3 | 5 | 5 | 4 | 4 | 4 |
| Bundle / binary size (0.05) | 4 | 5 | 4 | 4 | 5 | 5 | 5 | 5 |
| Implementation effort for this game (0.10) | 5 | 3 | 3 | 3 | 4 | 2 | 2 | 2 |
| **Weighted total** | **4.50** | **4.35** | 3.60 | **4.25** | 3.45 | 3.10 | 3.10 | 3.85 |

Rationale for the two non-obvious rows:
- *Runtime footprint* for the web candidates is capped at 4 because Chromium itself is the footprint
  (sum of RSS across its processes was ~870 MB during the probe, shared pages double-counted).
  The game's own heap on top of that is a few MB in every web variant.
- *Implementation effort* is included because raw WebGL2/wgpu/sokol all require hand-writing
  camera/matrix/mesh-streaming/frustum code that three.js and macroquad ship.

## 3. Ranked list

1. **A1 three.js + TypeScript + Vite** (4.50). Easiest for a newcomer, best docs, headless proven,
   whole test story in one language (vitest for sim, Playwright + pixelmatch for images).
   three.module.min.js is 366 KB / 87 KB gz; a tree-shaken hello-world bundle was 520 KB / 129 KB gz.
2. **A2 raw WebGL2 + twgl.js 7.0 (or ogl 1.0.11)** (4.35). Same tooling and headless story as A1,
   ~20 KB gz, but you write the camera, mat4 math, chunk VBO management and culling yourself.
   regl 2.1.1 is effectively unmaintained (last publish 2024-11); prefer twgl or ogl.
3. **B1 Rust wgpu 30 + winit 0.30.13** (4.25). Best headless purity (no browser, direct pixel buffer,
   `cargo test` end to end), true native binary, wasm target builds. Costs: Rust toolchain, a second
   web toolchain (trunk 0.21.14 or wasm-bindgen-cli 0.2.127 pinned to the crate version), 30 to 40 s
   cold builds, more hand-rolled scene code. wgpu 30 and winit 0.30 share raw-window-handle 0.6.2.
4. **D Rust glow 0.18 + glutin 0.32 (EGL surfaceless)** (3.85). Lighter than wgpu but you own context
   creation on every platform; only worth it if wgpu's Vulkan/GL abstraction is unwanted. Not probed.
5. **A3 WebGPU in the browser** (3.60). Works headless here only with `--enable-unsafe-webgpu` AND an
   https/localhost origin (see probe). Still flag-gated on Linux stable browsers; no benefit for
   200k flat triangles. Revisit in a year.
6. **B2 macroquad 0.4.16 / miniquad 0.4.11** (3.45). Delightful for a newcomer (8 s build, 1.5 MB
   binary, web without wasm-bindgen) but **cannot run headless on this box**: it only has X11 and
   Wayland backends and panics with `XOpenDisplay() failed!`. Would need Xvfb (not installed; sudo
   appears to work so `apt install xvfb` is possible, but that is a system change and adds a display
   server to every test run).
7. **B3 sokol-rust** (3.10). GitHub-only (crates.io `sokol` 0.3.0 is a dead 2019 crate). sokol_app
   needs a display; headless means bypassing sokol_app and owning an EGL context. Web via emscripten.
8. **C Zig 0.16 + sokol-zig** (3.10). sokol-zig supports Zig 0.16+ but its README flags a libvulkan
   issue on 0.16; same headless problem as B3; web needs emscripten. Not compellingly better than B1.

Excluded outright: Bevy 0.19.1 (multi-minute builds, ~100 MB binaries, ECS you do not need),
Godot/Unity (huge engines), Electron/Tauri desktop wrappers (only if a native shell is demanded).

## 4. Probe results (exact commands and outcomes)

All probes live under
`(scratchpad)/probes/`.

### 4.1 Registry checks

```
curl -s https://registry.npmjs.org/<pkg>/latest          # npm
curl -s https://index.crates.io/wg/pu/wgpu                # cargo sparse index (works, no UA needed)
curl -s -o /dev/null -w "%{http_code}" https://crates.io/api/v1/crates/wgpu           -> 403
curl -s -A "canyon-run-research (mail)" https://crates.io/api/v1/crates/wgpu          -> 200
```
`cargo add` resolves fine (sparse index). The 403 is only the JSON API without a User-Agent.

| npm | version | published | | crate | version | updated |
|---|---|---|---|---|---|---|
| three | 0.185.1 | 2026-07-01 | | wgpu | 30.0.1 | 2026-08-22 |
| @types/three | 0.185.4 | | | winit | 0.30.13 | 2026-03-02 |
| twgl.js | 7.0.0 | 2025-07-16 | | macroquad | 0.4.16 | 2026-07-30 |
| ogl | 1.0.11 | 2025-01-27 | | miniquad | 0.4.11 | 2026-06-03 |
| regl | 2.1.1 | 2024-11-12 | | glow | 0.18.0 | 2026-07-09 |
| vite | 8.2.2 | | | glutin | 0.32.3 | |
| typescript | 7.0.2 | | | sokol (crates.io) | 0.3.0 | 2019-04-29 (dead) |
| vitest | 4.1.11 | | | trunk | 0.21.14 | |
| playwright / @playwright/test | 1.62.1 | | | wasm-bindgen(-cli) | 0.2.127 | |
| pixelmatch | 7.2.0 | | | glam | 0.33.6 | |
| pngjs | 7.0.0 | | | libm | 0.2.16 | |
| | | | | bevy | 0.19.1 | (excluded) |

Playwright 1.62.1 expects Chromium revision 1234 (151.0.7922.34); `~/.cache/ms-playwright` now has
both 1208 and 1234 (1234 appeared during this session, installed by someone else). `/usr/bin/google-chrome`
151 also works via `executablePath`.

### 4.2 Probe A: headless WebGL2 in Chromium via playwright-core (web-probe/probe.mjs)

```
cd probes/web-probe && pnpm add playwright-core@1.62.1     # 0.7 s
node probe.mjs                                             # default: chromium-1208 executable
LABEL=x ARGS="--flags" CHROME=/usr/bin/google-chrome node probe.mjs
```
Page: 256x256 WebGL2 canvas, RGB triangle, `gl.readPixels`, then 1280x720 with 200,344 triangles
in one VBO, 10 frames timed with a 1-pixel readPixels sync per frame; `page.screenshot` to PNG.

| run | renderer | WebGL2 | center px | ms/frame 200k @720p | total |
|---|---|---|---|---|---|
| default (chromium-1208) | ANGLE Vulkan SwiftShader (Subzero) | yes | 63,64,128,255 (expected 64,64,128) | 19 to 26 | 0.7 s |
| `--use-gl=angle --use-angle=swiftshader` | same | yes | same | 27 | 1.0 s |
| `--use-angle=gl-egl` (Mesa llvmpipe) | **no context** | **no** | | | FAIL |
| chrome-headless-shell-1208 | SwiftShader | yes | same | 25 | 0.5 s |
| /usr/bin/google-chrome 151 | SwiftShader | yes | same | 29 | 0.8 s |

Console shows only `GPU stall due to ReadPixels` performance warnings (expected). Screenshot verified
visually (`web-probe/shot-default.png`).

WebGPU: with `page.setContent` the page is **not a secure context** (`isSecureContext=false`) so
`navigator.gpu` is absent no matter which flags are passed (6 flag combinations tried, all false).
Serving the same HTML from `https://probe.local/` via `page.route` fixed that:

| run (https origin) | navigator.gpu | requestAdapter |
|---|---|---|
| no flags | true | `No available adapters` |
| `--enable-unsafe-webgpu --enable-features=Vulkan` | true | adapter ok, vendor=google arch=swiftshader |
| `--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader` | true | adapter ok |
| google-chrome 151 `--enable-unsafe-webgpu --enable-features=Vulkan` | true | adapter ok |

Full-frame readback cost (web-probe/readback.mjs, 1280x720, warm):
`gl.readPixels` 2.6 ms in-page but ~90 ms round-trip to Node as base64 (3.7 MB);
`canvas.toDataURL('image/png')` 4.5 ms; `page.screenshot` 26 ms. Conclusion: compare images in-page
or via `page.screenshot`, do not ship raw RGBA to Node per frame.

Memory: sum of RSS of all Chromium processes during the probe: 867 MB (shared pages counted per process).

### 4.3 Probe A2: three.js + Vite production build rendered headless (vite-three/)

```
pnpm add three@0.185.1 vite@8 typescript@7 @types/three vitest@4 @playwright/test@1.62.1   # 2.9 s, node_modules 127 MB
pnpm exec vite build        # 0.9 s -> dist/assets/index-*.js 520 KB (129 KB gz)
pnpm exec vite preview --port 4173 &  ;  node shot.mjs
```
Result: lit IcosahedronGeometry(1, 40) rendered, screenshot `vite-three/three-shot.png` correct,
0.62 s from browser launch to PNG, console clean apart from a 404 for favicon and the readPixels
warning.

### 4.4 Probe B: Rust wgpu 30 headless on lavapipe / llvmpipe (wgpu-probe/)

```
cargo new wgpu-probe && cargo add wgpu@30 pollster@1 png@0.18     # index resolved in 0.6 s
cargo build --release          # deps: 31 s wall on 8 cores; incremental 1.1 s
./target/release/wgpu-probe                     # default backend selection
WGPU_BACKEND=gl ./target/release/wgpu-probe     # force Mesa GL (EGL surfaceless)
WGPU_BACKEND=vulkan ./target/release/wgpu-probe # force lavapipe
```
API notes for wgpu 30 (three compile errors on first try, all fixed in one pass):
`InstanceDescriptor::new_without_display_handle_from_env()`, `RenderPassDescriptor` and
`RenderPipelineDescriptor` both need `multiview_mask: None`, `get_mapped_range()` returns `Result`.

Output (no DISPLAY, no Xvfb):
```
adapter: name="llvmpipe (LLVM 20.1.2, 256 bits)" backend=Vulkan type=Cpu driver="llvmpipe" info="Mesa 25.2.8..."
adapter: name="llvmpipe (LLVM 20.1.2, 256 bits)" backend=Gl     type=Cpu info="4.5 (Core Profile) Mesa 25.2.8..."
selected: llvmpipe backend=Vulkan (83 ms)
pixel center(128,128)=(63, 65, 127, 255) corner(2,2)=(26, 26, 38, 255)
wrote triangle.png (187 ms since start)
200k tris @1280x720: 35 to 46 ms/frame (~27 fps) Vulkan/lavapipe ; 16 to 19 ms/frame (~55 fps) GL/llvmpipe
done in 367 to 746 ms total
```
GL backend prints `libEGL warning: failed to open /dev/dri/card1: Permission denied` then falls
back to surfaceless llvmpipe and works. PNGs verified visually (`wgpu-probe/triangle.png`, `many.png`).

| metric | value |
|---|---|
| Max RSS (`/usr/bin/time -v`) | 179 MB Vulkan, 161 MB GL (mostly LLVM JIT) |
| Binary | 7.6 MB release, 6.0 MB stripped (no LTO / opt-level=z yet) |
| wasm32 target | not installed by default; `rustup target add wasm32-unknown-unknown` worked |
| `cargo build --release --target wasm32-unknown-unknown --no-default-features --features wgpu/webgl,wgpu/webgpu,wgpu/wgsl` | success, 40 s, 5.3 MB .wasm before wasm-opt/LTO (expect ~1.5 to 2.5 MB after) |

### 4.5 Probe B2: macroquad headless (mq/)

```
cargo add macroquad@0.4 && cargo build --release    # 7.7 s, binary 1.5 MB
./target/release/mq
thread 'main' panicked at miniquad-0.4.11/src/native/linux_x11.rs:659:13: XOpenDisplay() failed!
```
miniquad's Linux backends are exactly `linux_x11` and `linux_wayland`; there is no surfaceless or
offscreen path in the source tree. Headless requires Xvfb.

### 4.6 Determinism micro-probe (det/)

Bit patterns of sin/cos/exp/atan2/pow/sqrt for 15 inputs, V8 (Node 24) vs Rust std (glibc libm):
4 of 90 results differ by 1 ULP (`cos(0.1)`, `cos(1000)`, `atan2(0.785..., 0.3)`, `sin(-2.5)`).
sqrt/exp/pow matched on this set. Consequence: any replay that crosses engines or languages must
not use platform `Math.*` / `f64::sin`; ship your own trig (polynomial or table) or use the pure-Rust
`libm` crate on both native and wasm.

## 5. Per-criterion notes

### Install / build / run for a newcomer
- **Web (A1/A2/A3):** `pnpm install && pnpm dev` (Vite 8 is rolldown-based, ~1 s builds). Tests need
  `pnpm exec playwright install chromium` once (~250 to 360 MB download) or `channel: 'chrome'` to use the
  installed Google Chrome. TypeScript 7.0.2 is the native (Go) compiler; fast typechecks.
- **wgpu (B1):** rustup + `cargo run`. Cold build 31 s on this box, 1 s incremental. Web needs
  `rustup target add wasm32-unknown-unknown` plus trunk (auto-fetches matching wasm-bindgen) and a
  small HTML/JS shim; wasm panics are harder to debug than TS errors.
- **macroquad:** the easiest Rust option (single crate, JS glue file, no wasm-bindgen) but disqualified
  by the headless requirement on this box.

### Runtime footprint for ~200k flat-shaded triangles at 60 fps
- Geometry is tiny: with `flat` interpolation or `dFdx/dFdy` normals, 200k tris is ~100k unique
  vertices x 12 B + 2.4 MB indices, or ~14 MB if vertices are duplicated with per-face normals. One or a
  few dozen draw calls (one per terrain chunk). Any of the candidates does this in well under 1 ms of
  CPU per frame on real hardware; on this VM the software rasterizers measured 16 to 46 ms/frame.
- Web: game heap a few MB; Chromium process tree several hundred MB regardless of library choice.
- Native wgpu: ~40 to 60 MB RSS typical on a real GPU driver (160 to 180 MB measured here only because
  llvmpipe JIT-compiles shaders with LLVM). macroquad/sokol are lower still (~20 MB).

### Headless render + pixel readback on this machine
- Web: works out of the box with SwiftShader (ANGLE over its own Vulkan). Mesa EGL path does not
  work in headless Chromium. WebGPU works only with flags plus a secure-context origin.
- wgpu: works with **zero** configuration on two backends. Both are CPU rasterizers, so results are
  deterministic across runs (good for golden images).
- macroquad/sokol/Zig: need a display server.

### Determinism
- All candidates: fixed timestep + input log is a design choice, not a stack property. Keep the sim
  free of rendering and wall-clock reads.
- **TS:** all arithmetic is f64 (`Math.fround` for f32 emulation, slow-ish). `Math.sin` etc. differ
  per JS engine (measured vs glibc above; Firefox/Safari differ from V8 too). Own trig fixes it.
  `Math.random` must be replaced by a seeded PRNG (xoshiro/mulberry32). Terrain noise should use
  integer hashing (e.g. 32-bit imul-based) so wasm/JS/native agree exactly.
- **Rust:** f32 is IEEE-deterministic on x86_64 and wasm32 (no x87, no FMA contraction unless you
  opt in). `f32::sin` uses platform libm; use `libm` crate or own code for bit-exact native/wasm.
  wasm SIMD/relaxed-simd is opt-in only.
- **Zig:** `@sin` lowers to LLVM intrinsics resolved by platform libm/compiler-rt; same caveat.

### Tests
- **Web:** sim = plain TS module with vitest (no DOM, sub-second). Render = Playwright test that loads
  the Vite build with a fixed seed + input script, waits for a frame counter, `page.screenshot`,
  compare with pixelmatch against a committed golden PNG (tolerance for SwiftShader vs GPU). Same
  Playwright harness doubles as the AI agent's driver (evaluate to inject inputs, read HUD state).
- **wgpu:** sim = `cargo test`. Render = a `#[test]` that builds the device headless (as in the probe),
  renders N fixed frames, compares against golden PNGs with `image` / `image-compare` 0.5. Everything
  in one process, ~0.3 s.

### Bundle / binary size
- three.js app: ~130 KB gz. raw WebGL2 + twgl: ~30 to 50 KB gz. WebGPU three: 185 KB gz for the core.
- wgpu native: 6 MB stripped (smaller with `lto = "fat"`, `opt-level = "z"`, `panic = "abort"`).
  wgpu wasm: 5.3 MB unoptimized, expect ~1.5 to 2.5 MB after wasm-opt; wgpu's WebGL + WebGPU
  backends both get linked when both features are on, so pick one for the web build.
- macroquad: 1.5 MB native, ~1 MB wasm.

## 6. Proposed shape for the primary stack (A1)

```
canyon-run/
  package.json           pnpm, three@0.185.1, vite@8, typescript@7, vitest@4, @playwright/test@1.62.1, pixelmatch@7
  src/sim/               pure TS: fixed-step world, plane physics, input log, seeded PRNG, own trig; no DOM, no three
  src/terrain/           marching cubes over integer-hash noise -> chunk meshes (Float32Array/Uint32Array)
  src/render/            three.js scene, one BufferGeometry per chunk, MeshLambert flatShading, DOM HUD
  src/main.ts            RAF loop: accumulate dt, step sim at 60 Hz, render at display rate
  tests/sim/*.test.ts    vitest
  tests/render/*.spec.ts Playwright: seed + scripted inputs -> screenshot -> pixelmatch vs golden
```
Playwright config: `channel: 'chrome'` or the cached Chromium 1234; no extra flags needed for WebGL2.
Expose `window.__game` (step, snapshot, screenshot hooks) so the agent can drive it via `page.evaluate`.

## 7. Fallback trigger and shape (B1)

Switch to wgpu when any of these become requirements: a standalone desktop executable, sub-100 MB
total memory including the host, or bit-exact replay across desktop and web builds.
Layout: `crates/sim` (no_std-friendly, `libm`, glam 0.33), `crates/render` (wgpu 30, WGSL),
`crates/app` (winit 0.30 native; wasm via trunk 0.21.14). Headless tests reuse the probe's
`new_without_display_handle_from_env()` path; `WGPU_BACKEND=gl` is ~2x faster than lavapipe here.
