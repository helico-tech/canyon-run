# CR-0009 evidence — first headless frames

`node tools/headless/shot.ts --seed 1 --ticks 0|300 --out …` at 640×360, headless
Chromium 151, renderer `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))`.

| Frame | Ticks | Resident chunks | Triangles | Frame hash | Console errors |
|---|---|---|---|---|---|
| `start.png` | 0 | 86 | 225 786 | `be6a123d` | 0 |
| `tick-300.png` | 300 | 97 | 251 498 | `a43d1043` | 0 |

Probes (rgba) at tick 0: top-centre `51,26,17` (rock roof, not sky: the canyon
is covered by design, see docs/domain/terrain-field.md), centre `255,154,92`
(fog/horizon colour at the far end), bottom-centre `149,99,43` (floor).

Observed: flat-shaded strata walls, pillars, boulders, roof, fog to the horizon
glow. Darker and more tunnel-like than the vivid target; biome atmosphere work
(CR-0016) owns brightness and altitude fog.
