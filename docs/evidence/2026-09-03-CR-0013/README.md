# CR-0013 evidence — HUD

`node tools/headless/run.ts --seed 1 --frames 120 --every 30 --out runs/cr13`
(page screenshots now include the DOM HUD). All gates ok including the new
"HUD frame drawn" check on the altitude bar border pixel; both Playwright
specs pass.

`frame-0090.png`: score and multiplier top centre, speed bar bottom left,
altitude bar with red ceiling zone on the right, artificial horizon and
reticle at centre, seed bottom right, edge glows by proximity.
