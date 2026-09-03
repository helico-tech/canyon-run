---
id: CR-0002
epic: EPIC-01
status: todo
---
# CR-0002 Repo scripts and pre-push hook

**Goal.** Work-item IDs and issue frontmatter are generated, never hand-written; pushes are gated.

**Files.** `scripts/new-work-item.ts` (`node scripts/new-work-item.ts <epic> <slug>` → next `CR-NNNN`, writes the file from a template),
`scripts/issues.ts` (`new <slug> --priority P2 --title ...`, `list [--status open]`, `resolve <file> --work CR-NNNN --commit <sha> --note ...`, `triage <file> --work CR-NNNN`),
`scripts/validate-docs.ts` (frontmatter of `docs/issues/*.md` and `docs/work/*.md`: known status/priority values, `triaged` needs `work:`, files only inside the declared layout),
`scripts/git-hooks/pre-push` (runs `pnpm check` and `node scripts/validate-docs.ts`), `package.json` `prepare` sets `core.hooksPath scripts/git-hooks`.

**Acceptance.** Scripts are TypeScript run by Node 24 directly (no build step). Unit tests cover ID allocation, frontmatter parsing, and validation failures. The hook is executable and installed by `pnpm install`.

**Verification.** `node scripts/new-work-item.ts EPIC-01 demo` in a temp copy allocates the next ID; `node scripts/validate-docs.ts` passes on the repo; a malformed fixture fails.
