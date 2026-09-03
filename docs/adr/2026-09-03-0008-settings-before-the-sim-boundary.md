---
status: accepted
date: 2026-09-03
---
# ADR 0008 — Player settings are input transforms applied before the sim boundary

## Context

Players want mouse sensitivity, an inverted vertical axis and a throttle on
W/S (issue `2026-09-03-player-settings`). The research note proposed storing
sensitivity in the replay header so validation stays exact. The sim (ADR 0002)
consumes integer mouse counts and a key bitmask; sensitivity is a sim constant
in `C`, and every constant is part of the replay's constants hash.

## Decision

Settings live entirely in the app layer (`src/app/settings.ts`) and are applied
by the `InputSampler` before rounding: raw pointer deltas are scaled by the
sensitivity and optionally flipped in Y; the W/S option swaps the key map so
W/S produce the throttle bits and Shift/Ctrl the pitch bits. The sim, its
constants, the checksum and the replay format do not change.

## Consequences

- A replay stores the counts the sim actually consumed, so it validates
  bit-for-bit on any machine regardless of the recorder's settings, and no
  header field is needed.
- The effective sensitivity range is 0.5–2 times the sim's fixed rate; the
  sim's own `MOUSE_SENS` stays the single tuning point for feel.
- Settings persist in localStorage through `Storage` with a shape guard, and
  the start screen is the only UI for them (no in-run menu).
