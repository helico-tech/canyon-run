---
id: CR-0037
epic: EPIC-05
status: done
---
# CR-0037 Browser playback stops at the replay's tick count

**Goal.** Close issue `2026-09-03-browser-playback-ignores-replay-ticks`:
the browser fed every decoded run to the sim while the validator stops at
`ticks`, so a replay with trailing runs validated ok yet flew differently.

**Files.** `src/sim/replay.ts` (`replaySource`: the replay's inputs for
exactly `ticks` frames, then zero input), `src/app/game.ts` (uses it),
`src/sim/replay.test.ts`.

**Acceptance.**
- A replay with a trailing run beyond `ticks` plays its first `ticks` inputs
  and zero input afterwards, in the same order the validator simulates.

**Verification.** The new test failed (no such function) and passes after;
`pnpm check` green.
