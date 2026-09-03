# Toolchain

Node 24 (runs `.ts` scripts directly), pnpm (see `packageManager`), Vite,
TypeScript, Vitest, ESLint + typescript-eslint, Prettier. Exact pins in
`package.json`; upgrades are deliberate commits.

| Command | What it does |
|---|---|
| `pnpm install` | installs and (via `prepare`) points git hooks at `scripts/git-hooks` |
| `pnpm dev` | Vite dev server |
| `pnpm build` | production build to `dist/` (relative base, works from any static server) |
| `pnpm check` | typecheck (app + DOM-free core), lint with zero warnings, format check, unit tests |
| `pnpm test` | unit tests only |

## Two tsconfigs

`tsconfig.json` covers everything with DOM and Node types. `tsconfig.sim.json`
re-checks `src/sim` and `src/terrain` with `lib: ["ES2022"]` and no DOM or Node
types so the deterministic core cannot reference `window`, `performance`,
`document` or `process`. `src/cli` is a Node adapter and is checked by the
main config only.

## Node runs TypeScript directly

Scripts and tools run with `node file.ts` (type stripping, no build). That
forbids non-erasable syntax: parameter properties, enums, namespaces.
`erasableSyntaxOnly` in `tsconfig.json` makes `tsc` reject them everywhere.

## Lint gate for the deterministic core

`eslint.config.js` bans, in `src/sim/**` and `src/terrain/**`: transcendental
`Math.*` members and `Math.round`, the `**` operator, and clock or platform
globals. `src/sim/lint-gate.test.ts` proves the rules fire. See ADR 0002.

## Version notes (2026-09-03)

- TypeScript 7.0.2 is the registry `latest`, but typescript-eslint 8.69 supports
  `>=4.8.4 <6.1.0`, so the project pins TypeScript 6.0.3.
- `*.md` and `docs/` are excluded from Prettier: research reports are kept verbatim.

## Repo scripts (TypeScript, run by Node directly)

| Command | Purpose |
|---|---|
| `pnpm work:new EPIC-NN slug --title "..."` | allocates the next `CR-NNNN` story file in `docs/work/` |
| `pnpm issue new slug --priority P2 --title "..."` | files an issue in `docs/issues/` with generated frontmatter |
| `pnpm issue list [--status open]` | queue, highest priority first, oldest first within a priority |
| `pnpm issue triage <file> --work CR-NNNN` | promotes an issue to a unit of work |
| `pnpm issue resolve <file> --work CR-NNNN --commit <sha> --note "..."` | resolves in place |
| `pnpm docs:validate` | layout and frontmatter validation (also run by the pre-push hook) |

The script is `pnpm issue` (singular): `pnpm issues` is a pnpm built-in that
opens the package's bug tracker.

The pre-push hook (`scripts/git-hooks/pre-push`, installed by `pnpm install`
through `prepare`) runs `pnpm check` and `pnpm docs:validate`.

## Continuous integration and Pages

`.github/workflows/ci.yml` runs `pnpm check`, docs validation and the
Playwright suite on pushes and pull requests. `.github/workflows/pages.yml`
builds `dist/` and deploys it to GitHub Pages on every push to `main`
(Vite `base: './'` keeps assets relative, so the project-pages subpath works).
