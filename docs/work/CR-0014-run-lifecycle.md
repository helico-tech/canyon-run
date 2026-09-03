---
id: CR-0014
epic: EPIC-05
status: todo
---
# CR-0014 Run lifecycle: start screen, death, restart, seeds, best score

**Goal.** A complete loop: start → fly → die → score panel → restart in < 300 ms.

**Files.** `src/app/screens.ts` (start overlay with seed input and controls help; run-over panel with time, distance, top speed, seed, best), `src/app/storage.ts` (localStorage in try/catch: best, lastSeed, settings), `src/app/seed.ts` (7-hex seed ↔ u32, URL hash `#seed=`), `src/app/game.ts` (state machine `idle | running | dead`), tests for seed codec and storage guards.

**Acceptance.**
- R restarts the same seed, N a new one, Enter from the panel restarts; the chunk cache survives a same-seed restart.
- Best score persists per seed and overall; `NEW BEST` shown when beaten.
- Death freezes the sim; the panel shows after 600 ms; input during the panel is ignored except R/N/Enter.

**Verification.** Playwright: force a collision via `__game.teleport`, assert the panel appears and R restarts with `tick = 0`.
