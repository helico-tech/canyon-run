---
id: CR-0028
epic: EPIC-08
status: done
---
# CR-0028 Final review and issue triage

**Goal.** Review the whole codebase against the spec and the working agreements; file every finding as an issue; fix P0/P1 before closing.

**Files.** `docs/issues/*`, fixes as separate small commits, `docs/specs/...` status updates, epics marked done.

**Acceptance.** `pnpm check`, `pnpm build`, `pnpm test:e2e` green; `node scripts/issues.ts list --status open` shows no P0/P1; every epic file lists status `done` or the open stories.

**Verification.** Output of the three commands in the closing commit message.

**Delivered notes.** `/code-review medium src/ tools/` plus a manual pass.
Fixed: editing the seed on the start screen ran the old seed; all-digit hex
seeds re-parsed as decimal (2.3 % of seeds did not round-trip); restart after a
replay kept the exhausted replay source; replay-driven headless runs compared
against a truncated validation; malformed replays threw instead of returning
`malformed`; the static server's path guard; the HUD-presence gate lost in a
rewrite. Cleanup: one score rate/factor shared by sim and HUD (multiplication
order kept bit-identical, goldens unchanged), one flag parser, one clamp, one
seed formatter, gate distance and cell ranges deduplicated, dead members
removed, the ceremony version test dropped. Positional scalars in numeric
kernels are a recorded decision (ADR 0006). Six open issues filed (P2 real-GPU
verification; P3 polish). Evidence in `docs/evidence/2026-09-03-CR-0028/`.
