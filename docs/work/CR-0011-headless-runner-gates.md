---
id: CR-0011
epic: EPIC-04
status: done
---
# CR-0011 Headless runner, semantic gates, contact sheets

**Goal.** One command runs a replay headless, dumps frames, checks them, and produces a sheet the agent reads.

**Files.** `tools/headless/serve.ts` (static server for `dist/`), `tools/headless/run.ts` (Playwright; args `--replay --seed --frames --every --width --height --out`), `tools/headless/stats.ts` (sky fraction, unique colours, edge density, probes, 3×3 means), `tools/headless/sheet.ts` (sharp contact sheet with labels), `tools/headless/gate.ts` (ADR 0003 checks → exit code), `tests/e2e/render.spec.ts` (Playwright test running the gate on seed 1), `playwright.config.ts`, scripts `headless`, `headless:gate`, `test:e2e`.

**Acceptance.**
- `pnpm headless -- --seed 1 --frames 300 --every 30 --out runs/seed1` writes `frames.jsonl`, `frame-*.png`, `sheet.png`, `stats.json` in < 60 s at 640×360.
- Gate checks: sky probe top band, non-sky bottom band, sky fraction 5–70 %, unique 4-bit colours > 200, edge density 1–40 %, temporal hash change between frames 0 and 60, zero console errors, sim checksum equals Node's for the same replay.
- Golden frame hashes stored under `tests/golden/<rendererKey>.json`; mismatch on the same renderer fails, other renderers skip with a notice.

**Verification.** `pnpm test:e2e` green; `docs/evidence/2026-09-03-CR-0011/sheet.png` committed.

**Delivered notes.** Gate thresholds differ from the story's draft: the canyon
has a rock roof, so "sky in the top band" became "horizon glow visible in the
run"; a single biome quantises to ~90 4-bit colours, so the variety floor is 40
rather than 200. 120 frames at 640×360 take ~6 s. The e2e spec compares
golden hashes only on the same renderer key. Evidence in
`docs/evidence/2026-09-03-CR-0011/`.
