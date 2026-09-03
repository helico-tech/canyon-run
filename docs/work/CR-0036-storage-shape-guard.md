---
id: CR-0036
epic: EPIC-05
status: done
---
# CR-0036 Storage validates stored shapes

**Goal.** Close issue `2026-09-03-storage-shape-unguarded`: a stored value
that parses but has the wrong shape (a stale or foreign `canyon.runs`,
`canyon.best`, `canyon.lastSeed`) threw outside the guard on the first death
and stopped the render loop, or made the best unwritable.

**Files.** `src/app/storage.ts` (typed guards on every read; run lists are
filtered element by element), `src/app/storage.test.ts`.

**Acceptance.**
- Wrong-shaped values read as absent; recording a run afterwards works and
  replaces them.
- A run list with foreign entries keeps only the well-formed runs.

**Verification.** The new test failed before the guards and passes after;
`pnpm check` green.
