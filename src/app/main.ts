import './hud.css';
import { SIM_VERSION } from '../sim/version.ts';
import { Game } from './game.ts';
import { createHud } from './hud.ts';
import { HudProbe } from './hudProbe.ts';
import { InputSampler } from './inputSampler.ts';
import { advance } from './loop.ts';
import { isLocked, requestLock } from './pointerLock.ts';
import { installTestApi, isTestMode } from './testMode.ts';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');
const canvas = document.createElement('canvas');
root.appendChild(canvas);
const hint = document.getElementById('hint');

const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') ?? 1) >>> 0;
const test = isTestMode();
const debug = params.get('debug') === '1';
const width = Number(params.get('w') ?? (test ? 640 : window.innerWidth));
const height = Number(params.get('h') ?? (test ? 360 : window.innerHeight));
canvas.width = width;
canvas.height = height;

const game = new Game(canvas, { seed, width, height, preserveDrawingBuffer: test });
const hud = createHud(root);
hud.setSeed(seed);
const hudProbe = new HudProbe(seed);
let hudClock = 0;
game.onRender = (state) => {
  hudClock += 1000 / 60;
  hud.update(state, hudProbe.view(state, game.replayLabel), test ? hudClock : performance.now());
};

if (test) {
  installTestApi(game, canvas, SIM_VERSION);
  game.render();
} else {
  if (debug) installTestApi(game, canvas, SIM_VERSION);
  const sampler = new InputSampler();
  game.setSource(() => sampler.take());

  window.addEventListener('keydown', (e) => {
    if (sampler.keyDown(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    if (sampler.keyUp(e.code)) e.preventDefault();
  });
  window.addEventListener('blur', () => sampler.releaseAll());
  canvas.addEventListener('click', () => requestLock(canvas));
  document.addEventListener('pointerlockchange', () => {
    const locked = isLocked(canvas);
    if (hint) hint.hidden = locked;
    if (!locked) sampler.releaseAll();
  });
  window.addEventListener('mousemove', (e) => {
    if (isLocked(canvas)) sampler.mouseMove(e.movementX, e.movementY);
  });

  await game.settle();
  let last = performance.now();
  let acc = 0;
  const frame = (now: number): void => {
    const a = advance(acc, now - last);
    last = now;
    acc = a.acc;
    if (a.ticks > 0) game.step(a.ticks);
    else game.world.update(game.state.z);
    game.render(a.ticks > 0 ? a.alpha : 1);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    game.renderer.resize(canvas.width, canvas.height);
  });
}
