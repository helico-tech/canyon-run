---
id: CR-0033
epic: EPIC-10
status: done
---
# CR-0033 Per-biome adversary sets, fairness audit and the dodging pilot

**Goal.** Prove every station is fair before it ships: a Node audit over the
closed-form motion, a matching Vitest gate, and a scripted pilot that can dodge
so survival regressions surface in CI.

**Files.** `src/sim/adversaryAudit.ts` (speed, z-depth, free hull position per
tick, reachability by dilation), `src/sim/adversary-audit.test.ts`,
`tools/adversary-audit.ts` (`pnpm adv:audit`), `src/sim/pilot.ts` (two-pass
dodge planner around the core: whole-period lanes first, arrival window as a
fallback), `src/sim/adversaries.ts` (`hullClearance`, crossing rule on the
vertical hull, press rule for vertical crossers, hoop drift clamp), cave set
switched to hoops, `ADV_HULL_RY`, goldens regenerated.

**Verification.** `docs/evidence/2026-09-03-CR-0033/`: audit ok for seeds 1–8
over 10 000 u and for every forced biome; the pilot survives seeds 1–8 at full
throttle to 10 000 u and every forced biome on seeds 1–3 to 8 000 u;
`pnpm check` green (108 tests).
**Scope.** `adversaries:` blocks on the seven biomes (spec §3), `tools/adversary-audit.ts`, the pilot lateral offset planner (dodge on by default), Vitest short audit, goldens regenerated once (SIM_VERSION bump).

**Acceptance.** Audit passes for seeds 1–8 over 10 000 u (speed, static corridor, reachable corridor); the pilot survives at full throttle on seeds 1–8; a DODGED count per seed is printed; `pnpm check` green.
