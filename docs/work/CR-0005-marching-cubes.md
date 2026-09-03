---
id: CR-0005
epic: EPIC-02
status: todo
---
# CR-0005 Marching cubes

**Goal.** Crack-free, deterministic mesher over a 33³ sample grid.

**Files.** `src/terrain/mc-tables.ts` (Bourke `edgeTable`, `triTable`), `src/terrain/march.ts` (`march(grid, cells, cellSize, out)` with the +axis edge cache; bit set for air corners; output non-indexed positions plus a per-triangle cell index for colouring), tests.

**Acceptance.**
- Table test: `edgeTable[0..15]` equals the known prefix; for every case each triangle edge is a crossing edge, every crossing edge is used, face segments used once and interior diagonals twice in opposite directions.
- A random 32³ grid meshes to a closed surface (0 open interior edges); winding faces air (case-1 normal points to corner 0).
- Two adjacent grids sharing a face produce bit-identical shared-edge vertices.
- Output capped at `MAX_TRIS_PER_CHUNK = 12000` with a clear error when exceeded.

**Verification.** `pnpm check`.
