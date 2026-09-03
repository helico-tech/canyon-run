---
id: CR-0028
epic: EPIC-08
status: todo
---
# CR-0028 Final review and issue triage

**Goal.** Review the whole codebase against the spec and the working agreements; file every finding as an issue; fix P0/P1 before closing.

**Files.** `docs/issues/*`, fixes as separate small commits, `docs/specs/...` status updates, epics marked done.

**Acceptance.** `pnpm check`, `pnpm build`, `pnpm test:e2e` green; `node scripts/issues.ts list --status open` shows no P0/P1; every epic file lists status `done` or the open stories.

**Verification.** Output of the three commands in the closing commit message.
