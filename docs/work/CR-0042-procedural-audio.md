---
id: CR-0042
epic: EPIC-07
status: done
---
# CR-0042 Procedural audio: engine, wind, callout blips

**Goal.** Close issue `2026-09-03-procedural-audio`: an engine drone and
wind that follow speed, a blip per score event and a thud on death, with a
sound toggle, without touching the sim.

**Files.** `src/app/audio.ts` (WebAudio graph behind an injectable context
interface), `src/app/audio.test.ts` (stub context), `src/app/main.ts`
(created outside test mode, resumed on the start click, muted by the setting,
updated per render), `src/app/settings.ts` and `screens.ts` (sound toggle),
`docs/domain/game-feel.md`, README.

**Acceptance.**
- Engine pitch and wind level rise with speed; muting drops the master to 0.
- Exactly one blip per score event (by event tick) and one thud per death.
- The context is resumed on the gesture that requests pointer lock.

**Verification.** Audio tests failed (no module) and pass after; `pnpm check`
green; the start screen capture shows the sound toggle with a clean console;
the lifecycle e2e run (click to fly) creates and resumes the context without
errors.
