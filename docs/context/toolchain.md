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

`tsconfig.json` covers everything with DOM types. `tsconfig.sim.json` re-checks
`src/sim`, `src/terrain`, `src/cli` with `lib: ["ES2022"]` and no DOM so the
deterministic core cannot reference `window`, `performance` or `document`.

## Lint gate for the deterministic core

`eslint.config.js` bans, in `src/sim/**` and `src/terrain/**`: transcendental
`Math.*` members and `Math.round`, the `**` operator, and clock or platform
globals. `src/sim/lint-gate.test.ts` proves the rules fire. See ADR 0002.

## Version notes (2026-09-03)

- TypeScript 7.0.2 is the registry `latest`, but typescript-eslint 8.69 supports
  `>=4.8.4 <6.1.0`, so the project pins TypeScript 6.0.3.
- `*.md` and `docs/` are excluded from Prettier: research reports are kept verbatim.
