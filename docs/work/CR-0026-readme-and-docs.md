---
id: CR-0026
epic: EPIC-08
status: done
---
# CR-0026 README and player/agent documentation

**Goal.** Install, run, play, validate a replay, run headless — each in one command, documented for humans and agents.

**Files.** `README.md` (install, run, controls, scoring, seeds, replays, headless, tests, layout), `docs/context/headless-validation.md`, `docs/context/replays.md`, `docs/evidence/README.md` (index of sheets).

**Acceptance.** A fresh clone following the README reaches a running game and a green `pnpm check`; every command in the README was executed while writing it.

**Verification.** Commands run from a fresh clone in the scratchpad.

**Delivered notes.** README covers install, play, replays, headless tools,
tests and layout, links the GitHub Pages deployment, and quotes the original
prompt. A fresh clone of the bare remote installed, passed 97 tests and built
(the bare repo's HEAD had pointed at a nonexistent master; fixed). CI and
Pages workflows added on request.
