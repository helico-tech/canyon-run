---
id: CR-0033
epic: EPIC-10
status: todo
---
# CR-0033 Per-biome adversary sets, fairness audit and the dodging pilot

**Goal.**

**Files.**

**Acceptance.**
-

**Verification.**
**Scope.** `adversaries:` blocks on the seven biomes (spec §3), `tools/adversary-audit.ts`, the pilot lateral offset planner (dodge on by default), Vitest short audit, goldens regenerated once (SIM_VERSION bump).

**Acceptance.** Audit passes for seeds 1–8 over 10 000 u (speed, static corridor, reachable corridor); the pilot survives at full throttle on seeds 1–8; a DODGED count per seed is printed; `pnpm check` green.
