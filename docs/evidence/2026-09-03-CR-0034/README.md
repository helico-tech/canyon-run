# CR-0034 evidence — adversary station sheets per biome (2026-09-03)

Each sheet: `node tools/headless/run.ts --seed 1 --biome <b> --skip 300 --frames 300 --every 30`
against the freshly built bundle (SwiftShader, 640×360). Every gate is ok in
all seven runs and the browser checksum equals Node's (`<b>-gate.json`).

| sheet | what to look for |
|---|---|
| `canyon-stations.png` | hoop and bouncing block sets of the hub |
| `cave-stations.png` | cyan hoop grows from a ring to a frame as the plane flies through its opening (f240–f270) |
| `crystal-spires-stations.png` | spinning blade beside the core, hoop ahead |
| `lava-rift-stations.png` | yellow station frame ahead (f120); press and jaws bodies at the station |
| `hoodoo-desert-stations.png` | blue post-and-lintel frame (f90–f120); bouncing block above the core beside its posts (f210) |
| `floating-archipelago-stations.png` | frame (f90–f120); pink orbiting shard passing beside the plane (f299) |
| `trench-run-stations.png` | red jaws either side of the plane with a THREADED callout (f0–f30); frame with jaws again at f299 |

Method note: the first pass was run against a bundle built before the
CR-0033 hull-model changes, and the "sim checksum equals Node" gate failed in
lava rift, hoodoo desert and floating archipelago, exactly the biomes whose
placement changed. Rebuilt, all seven pass. The gate is the regression net for
stale builds as much as for engine drift.
