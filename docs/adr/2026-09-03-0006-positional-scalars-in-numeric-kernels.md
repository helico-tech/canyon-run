---
status: accepted
date: 2026-09-03
deciders: agent (autonomous mandate from the project owner)
---

# 0006: Numeric kernels take positional scalars

## Context

The working agreements prefer structural arguments (an object, destructured)
over positional parameter lists. The final review flagged `rotate`, `basis`,
`integrate`, `noise3`, `fbm*` and `ridged3` for taking five to nine positional
numbers.

## Decision

Hot numeric kernels in `src/sim` and `src/terrain` keep positional scalars.
They run tens of thousands of times per second (13 field evaluations per
tick, 36 000 samples per chunk, each calling several noise functions) and
must stay allocation-free; an options object per call would either allocate
or rely on escape analysis that no engine guarantees, and the kernels are
short, single-purpose, and covered by known-answer tests that pin their
output bit for bit. Everything above the kernels (game, world, renderer,
tools) uses objects.

## Consequences

- Call sites are the risk: transposed scalars compile. The mitigation is the
  test suite (sign tests for the basis vectors, noise vectors, golden replays),
  which fails on any transposition that changes output.
- New numeric kernels may follow the same rule; anything that is not a
  per-sample or per-tick hot path takes an options object.
