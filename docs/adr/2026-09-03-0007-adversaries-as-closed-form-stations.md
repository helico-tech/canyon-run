---
status: accepted
date: 2026-09-03
deciders: agent (autonomous mandate from the project owner)
---

# 0007: Adversaries are stateless closed-form stations with analytic collision

## Context

The owner asked for adversaries that fit each biome and move only in the
cross-section plane, never forward or backward. They must be deterministic
and replayable (ADR 0002), cheap, fair at 170–200 u/s, and cannot live in the
marching-cubes field because they move (re-meshing per tick would cost more
than the whole terrain budget). Two research reports
(`docs/research/2026-09-03-06-adversaries-design.md`, `…-07-adversaries-integration.md`)
designed the concepts and the machinery.

## Decision

1. **Stations.** Adversaries are hashed z cells per biome, like arches. A
   station is a pure function of `(seed, segment, cell)`: shape, motion law,
   sizes, integer period and phase, rest centre on the corridor core. No
   station inside a blend zone, near a gate, or before `ADV_START` (600 u).
2. **Closed-form motion.** `pose(station, time, planeZ)` uses only
   `+ − × ÷ floor abs sqrt min max`, a triangle wave, a smoothstep-eased
   pendulum, a 32-entry literal (cos, sin) table, and an approach-driven
   "close" law. The sim evaluates it at integer ticks, the renderer at
   `tick + alpha`, so the picture is exactly where the kill is. Nothing is
   stored in `SimState`; the approach law replaces latched triggers.
3. **Shapes × motions.** Four 2D profiles (box, wedge, ring, blade) extruded
   along z, six translation laws and an optional spin, combined into a literal
   archetype table. Concepts map to rows; new rows are one line.
4. **Collision.** Analytic signed distances at the tick's end for the hull
   probes, a centre sphere, and a z-crossing sub-step when the hull passes a
   station's plane; the nearer of rock and adversary feeds proximity, the
   streak, CLOSE / SO CLOSE and THREADED unchanged; one new event DODGED on
   the crossing tick.
5. **Fairness by construction and by audit.** Kill volumes never enter the
   core tube before segment 4, are ≥ 4 u thick, move ≤ 1.5 u per tick, and a
   Node audit proves that a hull-sized free disc inside the core exists at
   every tick of every period and is reachable under a lateral speed bound.
   The scripted pilot gets a predictive lateral offset planner.
   > **AMENDED 2026-09-03 (CR-0033):** the "free disc" is now the level
   > five-probe hull itself (8 u wide, under 3 u tall), so thin bodies leave
   > lanes above and below; the thickness floor became a 2 u depth along z
   > (the sub-step spacing); a body crossing the core must not spin, is
   > clamped to leave a 3 u vertical lane, and a vertical crosser is a
   > press that dips in from the roomier side and never passes through.
6. **Rendering.** Instanced meshes per shape driven by the same pose
   function; an unlit "core" instance carries the telegraph; a bar frame marks
   the station on the walls. No worker changes.

## Consequences

- New constants change the constants hash; goldens are regenerated once, in
  the same story as the pilot planner.
- Difficulty is two more literal per-segment tables (probability, speed).
- Kinds that need agency (the "mimic") wait for a later story that adds a
  fixed, hashed slot array to the state.
