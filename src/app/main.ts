import { SIM_VERSION } from '../sim/version.ts';
import { Game } from './game.ts';
import { installTestApi, isTestMode } from './testMode.ts';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');
const canvas = document.createElement('canvas');
root.appendChild(canvas);

const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') ?? 1) >>> 0;
const test = isTestMode();
const width = Number(params.get('w') ?? (test ? 640 : window.innerWidth));
const height = Number(params.get('h') ?? (test ? 360 : window.innerHeight));
canvas.width = width;
canvas.height = height;

const game = new Game(canvas, { seed, width, height, preserveDrawingBuffer: test });

if (test) {
  installTestApi(game, canvas, SIM_VERSION);
  game.render();
} else {
  // Bootstrap demo loop: the scripted pilot flies at 60 Hz until CR-0012 adds input.
  let last = performance.now();
  let acc = 0;
  const frame = (now: number): void => {
    acc += Math.min(now - last, 250);
    last = now;
    let ticks = 0;
    while (acc >= 1000 / 60 && ticks < 5) {
      game.step(1);
      acc -= 1000 / 60;
      ticks++;
    }
    if (ticks === 5) acc = 0;
    game.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    game.renderer.resize(canvas.width, canvas.height);
  });
}
