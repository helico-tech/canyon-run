# CR-0028 evidence — release checks

- GitHub: https://github.com/helico-tech/canyon-run — `ci` (check, docs
  validation, Playwright suite) and `pages` workflows green on commit 4497cb2.
- Live site: https://helico-tech.github.io/canyon-run/ — driven headless from
  this VM through `?test=1`: 120 ticks, `alive = 1`, resident chunks 85, two
  terrain workers, zero console errors, and the state checksum `8f74b8ea`
  equals the golden replay's checkpoint at tick 120 (`tests/replays/seed-1.json`).
  `live-pages-tick120.png` is the frame captured from the deployed build.
- Fresh clone of the bare remote: `pnpm install`, `pnpm check` (97 tests) and
  `pnpm build` pass; the pre-push hook is installed by `prepare`.
- Playwright suite on GitHub's runner passed with the golden frame hashes, so
  SwiftShader frames match across machines.
