# CR-0042 evidence — procedural audio (2026-09-03)

Headless Chromium cannot play sound, so the evidence is structural:

- `start-with-sound-toggle.png`: the start screen (`?debug=1&seed=1`,
  640×360) with the sound toggle in the settings row; console error count 0
  with the AudioContext created.
- `src/app/audio.test.ts` drives the graph through a stub context: engine
  pitch and wind gain rise with speed, muting zeroes the master, exactly one
  blip per score event and one thud per death, resume on demand.
- The lifecycle Playwright test clicks "click to fly", which resumes the
  context on the same gesture that requests pointer lock; the run proceeds
  with no page errors.
