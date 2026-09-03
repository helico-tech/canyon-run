# CR-0022 evidence — biome gates and difficulty

- `gate-sheet.png`: `node tools/headless/run.ts --seed 1 --skip 400 --frames 200 --every 25`
  through the first boundary at z = 1200: the accent-coloured gate frame in the
  feature-free clear zone, canyon fading into the next biome. All gates ok.
- Pilot survival at full throttle through six segments (five boundaries), Node:

| seed | alive | segments crossed | z | ticks | score |
|---|---|---|---|---|---|
| 1 | yes | 6 | 10 802 | 3 872 | 15 830 435 |
| 2 | yes | 6 | 10 801 | 3 871 | 16 219 111 |
| 3 | yes | 6 | 10 802 | 3 870 | 15 983 978 |

Golden replays regenerated (SIM_VERSION 0.1.7; constants hash changed by
`SPEED_FLOOR` and `GATE_BONUS`) and golden frame hashes regenerated: segment 0
now runs at half feature density and 0.7 roughness by design.
