# 02 — Headless rendering, capture and validation on this machine

Date: 2026-09-03. Probes live in `scratchpad/probes/headless/` (`browser/` = Playwright + WebGL2, `wgpu-offscreen/` = Rust wgpu). Every number below was measured here (Ubuntu 24.04 VM, 8 vCPU, 15 GB, Virtio GPU, Mesa 25.2.8, no X server, no Xvfb).

## TL;DR

- **Both paths work headless with zero extra setup.** Playwright's Chromium renders WebGL2 through ANGLE → Vulkan → SwiftShader with *no flags*. Rust wgpu 30.0.1 finds Mesa lavapipe (`llvmpipe`, Vulkan) with *no env vars* and no window.
- **Throughput is "validation-grade", not real-time**: ~15–20 rendered frames/s at 1280×720 for a 100k-triangle scene on either rasterizer, ~30 frames/s at 640×360. A 300-frame deterministic run with 10 PNG dumps takes 10–20 s. Fine for stepping a fixed-timestep sim and dumping frames.
- **Rendering is bit-for-bit deterministic across runs and across Chromium/headless-shell/Chrome** (same SwiftShader). Different rasterizers (SwiftShader vs lavapipe, wgpu Vulkan vs GL) differ only at polygon edges (0.01–0.2 % of pixels).
- **Recommended workflow**: replay-driven fixed-step runs via `window.__game` (browser) / CLI flags (native) → per-frame `{frame, state, hash}` log + PNG every N frames → cheap semantic pixel checks (sky/terrain/HUD probes, histogram, edge density) as hard assertions → golden hashes for exact regression on a pinned rasterizer → contact sheet the agent reads with one `Read` call.

## Environment facts verified during probing

| Item | Value |
|---|---|
| Playwright (npm latest) | 1.62.1 → needs `chromium-1234` / `chromium_headless_shell-1234` = Chrome 151.0.7922.34. Installed with `pnpm exec playwright install chromium chromium-headless-shell` (389 MB + 262 MB, ~1 min). The pre-existing `chromium-1208` is what `playwright-cli` (v0.1.1, bundled playwright-core 1.59-alpha) uses. |
| System Chrome | 151.0.7922.137 at `/usr/bin/google-chrome`; usable via `channel: 'chrome'`, same SwiftShader result. |
| Rust | 1.95, cargo index resolves: `wgpu 30.0.1`, `pollster 1.0.1`, `png 0.18.1`, `bytemuck 1.25.2`. Cold release build ≈ 2–3 min, incremental < 1 s. |
| Vulkan ICDs | `/usr/share/vulkan/icd.d/lvp_icd.json` (lavapipe) + virtio/intel/radeon/nouveau stubs. No `vulkaninfo`/`glxinfo`/`eglinfo` binaries installed. |
| DRM | `/dev/dri/renderD128` and `card1` exist but are not readable by this user (harmless `libEGL warning: failed to open ... Permission denied` on the GL path; EGL falls back to surfaceless llvmpipe). |

## 1. Browser path (TypeScript + WebGL2)

### What works, flag by flag

| Launch | WebGL2 | Renderer string | WebGPU |
|---|---|---|---|
| `chromium.launch({headless:true})` (new headless, Chrome 151) | yes | `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)` | no (`requestAdapter()` → null) |
| `channel: 'chromium-headless-shell'` | yes | same SwiftShader | no |
| `channel: 'chrome'` (system Chrome 151) | yes | same SwiftShader | no |
| `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist` | yes | same SwiftShader (flags are redundant on Chrome 151) | no |
| `--use-gl=egl --ignore-gpu-blocklist` | yes | falls back to SwiftShader | no |
| `--use-gl=angle --use-angle=vulkan --ignore-gpu-blocklist` | yes | `ANGLE (Mesa, Vulkan 1.4.318 (llvmpipe (LLVM 20.1.2 256 bits)), llvmpipe)` — **Mesa lavapipe inside Chrome** | no |
| `--enable-unsafe-webgpu --enable-features=Vulkan,WebGPU --use-webgpu-adapter=swiftshader` | yes | SwiftShader | **yes**, adapter `{vendor:'google', architecture:'swiftshader'}` |

Conclusions: no flags are needed for WebGL2. The only two flags that change anything are `--use-angle=vulkan` (switch rasterizer to lavapipe) and the WebGPU trio (enables WebGPU on SwiftShader; lavapipe was not picked up for WebGPU even with `--use-vulkan=native`). `playwright-cli` also works but **blocks `file:` URLs** — serve the game over `http://127.0.0.1` (e.g. `python3 -m http.server`) and use `eval "() => …"`; its screenshots land in `.playwright-cli/page-*.png`.

`page.on('console')` shows a benign SwiftShader warning on every readback: `GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels` — filter it out of the "zero console errors" gate.

### Measured numbers (Chrome 151, SwiftShader unless stated)

Scene: seeded cloud of N flat-shaded triangles, depth test on, sky clear colour, HUD div overlay. `bench` = N draws then a 1×1 `readPixels` to force completion.

| Scene | Resolution | Rasterizer | ms/frame | frames/s |
|---|---|---|---|---|
| 1 triangle | 800×600 | SwiftShader | 0.23 | ~4300 |
| 100k small tris | 800×600 | SwiftShader | 45–75 (noisy; first run 125 while JIT warms) | 13–22 |
| 100k small tris, 300 frames + 10 PNG dumps | 1280×720 | SwiftShader (headless-shell) | ~60 (17.5–19.6 s total) | ~16 |
| same | 1280×720 | SwiftShader (new headless chromium) | ~58 (17.5 s) | ~17 |
| same | 1280×720 | lavapipe (`--use-angle=vulkan`) | ~113 (34.3 s) | ~9 |
| 20k large tris (fill-heavy, 120 frames) | 1280×720 | SwiftShader | ~190 (23 s) | ~5 |
| same | 1280×720 | lavapipe | ~110 (13.3 s) | ~9 |
| 100k small tris, 300 frames | 640×360 | SwiftShader | ~33 (9.9 s) | ~30 |
| 20k large tris, 120 frames | 640×360 | SwiftShader | ~58 (7 s) | ~17 |
| rAF loop (real-time) | 800×600, 100k tris | SwiftShader | — | 18–36 (rAF is capped at 60 for trivial scenes) |

Takeaways: SwiftShader wins on vertex-heavy scenes, lavapipe wins on fill-heavy ones (a canyon with big screen-covering polygons is closer to the fill-heavy case, so try both once the real scene exists). Fill cost scales with pixels: **run validation at 640×360 or 800×450** unless the check needs full-res.

Capture cost, per frame at 800×600 → 1280×720:

| Method | Cost | Notes |
|---|---|---|
| `canvas.toDataURL('image/png')` returned through `page.evaluate` | 11–15 ms | Cheapest PNG. Needs `preserveDrawingBuffer: true` or call inside the same task as the draw. |
| `gl.readPixels` → base64 string via `page.evaluate` | 60–70 ms | Raw RGBA (3.7 MB at 720p); needed only for in-page hashing/probes, which should happen *in the page* anyway. |
| `page.screenshot({path})` | 90–110 ms (one outlier 1.8 s with the swiftshader flags) | Composited page incl. HUD DOM. Use for the "what the user sees" shot. |
| `gl.readPixels` → JS `Array` via `page.evaluate` | **5.2 s** | JSON serialisation of 1.9 M numbers. Never do this. |
| in-page FNV-1a hash of the RGBA buffer | ~2–3 ms + readback | Included in the ~1.7 s per 30-frame chunk above. |

Memory (RSS of the whole browser process tree, 100k-tri scene): headless-shell 520–605 MB, new-headless chromium ~724 MB, native wgpu binary 187 MB peak. JS heap 10–45 MB.

Determinism: two independent runs of the same replay produced identical hashes for all 10 dumped frames (`diff runs/run1/frames.jsonl runs/run2/frames.jsonl` empty). chromium vs headless-shell: 0 mismatched pixels. SwiftShader vs lavapipe on the same frame: 0.218 % pixels (pixelmatch threshold 0.1), 0.068 % at 0.3, max channel delta 177 (edge pixels); 1-triangle frame: max channel delta 1 (sky (115,179,242) vs (115,178,242)).

### Exact commands

```bash
cd scratchpad/probes/headless/browser
node probe.mjs <variant> [tris] [w] [h]          # variants: chromium-default, headless-shell-default, chrome-default,
                                                  # chromium-swiftshader, chromium-angle-vulkan, chromium-egl,
                                                  # chromium-webgpu, chromium-webgpu-lavapipe
node replay.mjs headless-shell 100000 300 30 run1 # replay-driven run: 300 frames, PNG every 30, hash log, contact sheet
W=640 H=360 node replay.mjs lavapipe 20000 120 30 run-fill 8
node diff.mjs a.png b.png 0.1 diff.png            # pixelmatch + raw stats (~13 ms per 720p pair)
node stats.mjs frame.png [probes.json]            # dominant colours, sky %, unique colours, edge density, 3×3 means, probes
node sheet.mjs sheet.png 5 256 frame-*.png        # contact sheet via sharp (46 ms for 5 thumbs)
```

## 2. Native path (Rust + wgpu)

`wgpu 30.0.1`, no window, no surface: `Instance::new(InstanceDescriptor::new_without_display_handle_from_env())` → `request_adapter` with `compatible_surface: None` → render to an `Rgba8Unorm` texture with `COPY_SRC` → `copy_texture_to_buffer` (rows padded to 256 B) → `map_async` + `device.poll(PollType::wait_indefinitely())` → strip padding → `png` crate. Source: `scratchpad/probes/headless/wgpu-offscreen/src/main.rs` (compiles clean on wgpu 30; note API changes vs older tutorials: `enumerate_adapters` is async, `RequestAdapterOptions.apply_limit_buckets`, `bind_group_layouts: &[Some(&bgl)]`, `VertexState.buffers: &[Some(..)]`, `DepthStencilState.depth_write_enabled: Option<bool>`, `multiview_mask`, `RenderPassColorAttachment.depth_slice`, `get_mapped_range()` returns `Result`).

Adapters enumerated with **no env vars**:

```
adapter: "llvmpipe (LLVM 20.1.2, 256 bits)" backend=Vulkan type=Cpu driver=llvmpipe Mesa 25.2.8
adapter: "llvmpipe (LLVM 20.1.2, 256 bits)" backend=Gl     type=Cpu driver=4.5 (Core Profile) Mesa 25.2.8   (EGL surfaceless)
chosen: Vulkan
```

| Scene | Resolution | Backend | ms/frame | +readback |
|---|---|---|---|---|
| 1 triangle | 800×600 | Vulkan/lavapipe | 0.27 | 0.47 |
| 100k tris | 800×600 | Vulkan/lavapipe | 55.7 | 56.9 |
| 100k tris | 800×600 | GL/llvmpipe (EGL) | 45.8 | 46.2 |
| 100k tris | 1280×720 | Vulkan/lavapipe | 62.8–63.1 | 62–66 |

Init (instance+adapter+device) 30–60 ms. Peak RSS 187 MB. Readback is nearly free (1–3 ms), so **dump every frame if you like**. Vulkan vs GL backend on the same frame: 8 of 480k pixels differ (edge rasterisation), so pin the backend for golden hashes.

Env vars: none required. Useful: `WGPU_BACKEND=vulkan|gl` (honoured through `*_from_env`), `VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json` to pin lavapipe and silence other ICDs, `WGPU_POWER_PREF`, `RUST_LOG=wgpu_hal=warn`. `LIBGL_ALWAYS_SOFTWARE`/`MESA_LOADER_DRIVER_OVERRIDE` were not needed (llvmpipe is already the only working driver).

```bash
cd scratchpad/probes/headless/wgpu-offscreen && cargo build --release
./target/release/wgpu-offscreen <tris> <w> <h> <frames> <out.png>     # prints JSON: adapter, ms/frame, centre/corner pixel, FNV hash
WGPU_BACKEND=gl ./target/release/wgpu-offscreen 100000 800 600 30 gl.png
```

wasm build of the same game would be validated through path 1 (WebGL2 via `wgpu`'s GL backend or WebGPU with the flags above).

## 3. Validation workflow — ranked

Principle: the sim is stepped at a fixed dt from a replay; every frame produces `{frame, state, hash}`; PNGs are sampled. Checks run in the page (or the native binary) so only small JSON crosses the process boundary. Cross-rasterizer robustness comes from *semantic* checks; exactness comes from *hashes on a pinned rasterizer*.

1. **Frame-hash + state log (exact regression, ~free).** FNV-1a over the RGBA buffer (2–3 ms/720p frame in JS) written to `frames.jsonl` next to `state` (position, yaw, speed, score). Commit the log as the golden for the replay. Assertion: hashes equal for the same rasterizer string (`window.__info.renderer`); state equal always. Measured: identical across runs and across chromium/headless-shell/chrome. Risk: any intentional visual change requires regenerating; a Playwright/Chrome upgrade can change SwiftShader → keep goldens keyed by renderer string and re-baseline deliberately. Also hash the *sim state* separately so rendering-only changes don't mask logic regressions.
2. **Semantic pixel checks (robust, rasterizer-independent, the default gate).** All cheap enough to run on every dumped frame in the page:
   - Pixel probes with tolerance ±3: top-centre strip is sky colour, bottom-centre is *not* sky (terrain visible), HUD anchor pixels are HUD colour. Sky tolerance needed: SwiftShader/lavapipe round 0.70·255 to 179/178.
   - Sky fraction (top band): expected range for the flight profile (e.g. 15–60 %); 100 % = terrain not drawn, 0 % = camera inside terrain.
   - Colour variety: unique 4-bit-quantised colours > N (flat shading gives one colour per face normal; measured 1328 for the 100k scene vs 15 for 20 huge polys) and dominant-colour share < 70 %.
   - Edge density (luma delta > 24 between neighbours): non-zero and bounded (measured 12 % dense scene, 0.6 % huge polys, 0.23 % single triangle).
   - Temporal: hash(frame n) ≠ hash(frame n+30) while moving; yaw-right replay shifts the 3×3 grid means left→right; nothing changes when paused.
   - Zero `pageerror`/console errors (after filtering the SwiftShader ReadPixels warning), `webglcontextlost` never fires.
3. **Golden images + perceptual diff (layout/HUD, medium cost).** `pixelmatch` (13 ms per 720p pair) or `odiff`; also `@playwright/test`'s `toHaveScreenshot({ maxDiffPixelRatio })`. Measured cross-rasterizer noise is 0.01–0.22 % of pixels at threshold 0.1, so `maxDiffPixelRatio: 0.01` (1 %) absorbs SwiftShader↔lavapipe, while same-rasterizer is exactly 0. Flakiness is low *because* software rasterizers are deterministic; the real risk is upgrades, so store goldens per renderer string and regenerate via a script, never by hand. Use it for HUD/text and a few hero frames, not for every frame.
4. **Agent visual review.** `sheet.mjs` composites 10–20 frames with labels (46 ms); the agent reads the sheet PNG with one `Read` call, which was enough to spot the yaw motion and the sky band in the probes. Use 256–320 px thumbnails; open a single full-res frame only when the sheet looks wrong. Keep runs small (a 300-frame/10-PNG run at 720p is 3 MB).
5. **Real-time rAF smoke.** Only to confirm the game loop runs (`__rafBench`), never for perf numbers: SwiftShader rAF sits at 18–36 fps for real scenes.

Before/after discipline (per global CLAUDE.md): run the same replay before and after a change, diff `frames.jsonl` (state must match unless the change is to the sim), diff hashes (must match unless the change is visual), and read both contact sheets.

## 4. Driving input headlessly and the debug API

Do not synthesise keyboard events for validation; feed input state per frame.

- **Replay file** `replay.json`: `{ "seed": 1, "dt": 0.016666, "frames": [ { "yaw": 1, "pitch": 0, "throttle": 1 }, … ] }` (RLE runs like `{ "n": 100, "yaw": 1 }` keep it small). Injected *before* the page loads with `page.addInitScript(r => { window.__replay = r }, replay)`; alternatively `?replay=/replays/x.json&test=1` fetched by the game. The probe's `replay.mjs` does exactly this and the yaw in the state log follows the script.
- **Test mode** (`?test=1` or `window.__replay` present): no rAF autostart, fixed dt, seeded RNG, no `Date.now`/`performance.now` in the sim, no pointer lock, `preserveDrawingBuffer: true`, HUD text uses a fixed font size.
- **`window.__game`** (already shaped in `scene.html`): `step(n)`, `frame()`, `state()`, `setInput({yaw,pitch,throttle})`, `seed(n)`, `readPixel(x,y)`, `readFrame()`, `frameHash()`, `dataURL()`, `bench(n)`, plus `window.__info` (renderer/vendor/version). Keep it on `window` only in test mode. Sim (`step`) and render must be separable so state hashes are rendering-independent.
- **Native**: same contract as CLI flags `--replay file.json --frames 300 --dump-every 30 --out dir --width 640 --height 360`, printing one JSON line per frame; use the same JSON replay format so one fixture drives both builds.
- **Playwright `page.keyboard`** still works headless if a UX-level smoke (menus, pause) is needed, but treat it as a separate, non-deterministic check.

## Failures and gotchas encountered

- Playwright 1.62.1 refused the pre-installed `chromium-1208`; it needs revision 1234 (download worked, ~1 min).
- `playwright-cli open file://…` → "Access to file: URL is blocked"; serve over HTTP. Its `eval` needs a function expression, not a bare expression.
- `browser.process()` does not exist in Playwright's public API (used `ps` for RSS).
- Returning a `Uint8Array` as an `Array` from `page.evaluate` costs seconds; return base64 or, better, compute hashes/probes in the page.
- wgpu 30 broke several fields vs wgpu ≤ 25 examples (listed in §2); 11 compile errors on the first attempt, all mechanical.
- `libEGL warning: failed to open /dev/dri/renderD128: Permission denied` on the wgpu GL backend and Vulkan enumeration — harmless. Adding the user to the `render` group would silence it but is not needed.
- Perf numbers vary ±40 % run to run on this VM (SwiftShader's Subzero JIT warm-up, host contention). Warm up ≥10 frames and compare medians; never gate on fps.
