---
id: CR-0001
epic: EPIC-01
status: done
---
# CR-0001 Toolchain and quality gates

**Goal.** A newcomer runs `pnpm install && pnpm dev` and sees the game shell;
`pnpm check` runs typecheck, lint and unit tests; `pnpm build` produces `dist/`.

**Files.** `package.json` (pnpm, exact pins), `vite.config.ts`, `tsconfig.json`
(app, DOM lib), `tsconfig.sim.json` (`src/sim`, `src/terrain`; `src/cli` is Node code, checked by the main config:
`lib: ["ES2022"]`, no DOM), `eslint.config.js` (typescript-eslint;
`no-restricted-properties` on `Math` transcendentals, `no-restricted-syntax`
for `**`, `Date`, `performance`, `Math.random` in `src/sim/**` and
`src/terrain/**`), `.prettierrc`, `vitest.config.ts`, `index.html`,
`src/app/main.ts` (placeholder title), `src/sim/version.ts` (`SIM_VERSION`),
`docs/context/toolchain.md`.

**Acceptance.**
- `pnpm check` = typecheck (both tsconfigs) + `eslint . --max-warnings 0` + `prettier --check .` + `vitest run`.
- A test proves the lint rule: a fixture under `src/sim/` using `Math.sin` fails lint (checked through ESLint's Node API).
- Versions read from the registry today: typescript 7.0.2, vite 8.2.2, vitest 4.1.11, three 0.185.1, @types/three 0.185.4, eslint 10.9.1, typescript-eslint 8.69.0, prettier 3.9.6, @playwright/test 1.62.1, fast-check 4.9.0. If a pin fails, the working version is recorded in `docs/context/toolchain.md`.

**Verification.** `pnpm install`, `pnpm check`, `pnpm build`, `git status --porcelain` empty.
