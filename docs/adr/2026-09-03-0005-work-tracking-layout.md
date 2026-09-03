---
status: accepted
date: 2026-09-03
deciders: agent (autonomous mandate from the project owner)
---

# 0005: Work tracking — epics and stories in docs/work, research in docs/research

## Context

The working agreements declare `docs/{adr,specs,work,issues,domain,context}`
and allow amendments when recorded. The project owner asked for research by
multiple agents, then epics and stories. Two additions are needed.

## Decision

- `docs/evidence/` holds committed proof of progress: contact sheets, screenshots
  and stats from headless runs, in dated per-story folders `YYYY-MM-DD-CR-NNNN/`.
- `docs/research/` holds the dated research reports that fed the ADRs. They are
  evidence, kept verbatim apart from path normalisation.
- `docs/work/` holds both epics and stories. Epics are `EPIC-NN-<slug>.md` and
  list their stories; stories are units of work `CR-NNNN-<slug>.md` (component
  `CR` for the single package). Stories carry `epic:` and `status:` in their
  frontmatter. IDs come from `scripts/new-work-item.ts`.
- `scripts/issues.ts` creates, lists and resolves issues so frontmatter is
  never hand-written.

## Consequences

- One directory to read for "what is planned and what is done".
- Push validation (pre-push hook) checks frontmatter of issues and work items.
