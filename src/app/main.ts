import './hud.css';
import './screens.css';
import { SIM_VERSION } from '../sim/version.ts';
import { Game } from './game.ts';
import { createHud } from './hud.ts';
import { HudProbe } from './hudProbe.ts';
import { InputSampler } from './inputSampler.ts';
import { advance } from './loop.ts';
import { isLocked, requestLock } from './pointerLock.ts';
import { createScreens } from './screens.ts';
import { hashForSeed, parseSeed, randomSeed, seedFromHash } from './seed.ts';
import { browserStorage } from './storage.ts';
import { installTestApi, isTestMode } from './testMode.ts';
import { isReplay } from '../sim/replay.ts';
import type { Replay } from '../sim/replay.ts';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');
const canvas = document.createElement('canvas');
root.appendChild(canvas);
const hint = document.getElementById('hint');

const params = new URLSearchParams(window.location.search);
const test = isTestMode();
const debug = params.get('debug') === '1';
const nogl = params.get('nogl') === '1';
const workersParam = params.get('workers');
const workers = workersParam ? Number(workersParam) : undefined;
const storage = browserStorage();
const seed =
  (params.get('seed') !== null ? parseSeed(params.get('seed')!) : null) ??
  seedFromHash(window.location.hash) ??
  storage.lastSeed() ??
  randomSeed();
const replayUrl = params.get('replay');
let pendingReplay: Replay | null = isReplay(window.__replay) ? window.__replay : null;
if (replayUrl && !pendingReplay) {
  try {
    const fetched: unknown = await (await fetch(replayUrl)).json();
    if (isReplay(fetched)) pendingReplay = fetched;
    else console.error('replay: not a canyon-replay/1 file');
  } catch (err) {
    console.error('replay: failed to load', err);
  }
}
const width = Number(params.get('w') ?? (test ? 640 : window.innerWidth));
const height = Number(params.get('h') ?? (test ? 360 : window.innerHeight));
canvas.width = width;
canvas.height = height;

const game = new Game(canvas, {
  seed: pendingReplay?.seed ?? seed,
  width,
  height,
  preserveDrawingBuffer: test,
  nogl,
  workers,
});
const hud = createHud(root);
let hudProbe = new HudProbe(seed);
let hudClock = 0;
game.onRender = (state) => {
  hudClock += 1000 / 60;
  hud.update(state, hudProbe.view(state, game.replayLabel), test ? hudClock : performance.now());
};
const applySeed = (s: number): void => {
  hud.setSeed(s);
  hudProbe = new HudProbe(s);
  storage.setLastSeed(s);
  if (!test) history.replaceState(null, '', hashForSeed(s));
};
applySeed(game.seed);

if (test) {
  installTestApi(game, canvas, SIM_VERSION);
  if (pendingReplay) game.loadReplay(pendingReplay);
  game.start();
  game.render();
} else {
  if (debug) installTestApi(game, canvas, SIM_VERSION);
  const screens = createScreens(root);
  const sampler = new InputSampler();
  game.setSource(() => sampler.take());
  if (hint) hint.hidden = true;

  const begin = (s: number): void => {
    if (s !== game.seed) applySeed(s);
    screens.hideStart();
    screens.hideRunOver();
    sampler.releaseAll();
    sampler.enabled = true;
    if (game.phase === 'idle' && s === game.seed) game.start();
    else game.restart(s);
    requestLock(canvas);
  };
  screens.onStart((text) => begin(parseSeed(text) ?? game.seed));
  screens.onCopyReplay(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(game.replay({ recordedBy: 'browser' })));
      return true;
    } catch {
      return false;
    }
  });
  if (pendingReplay) {
    game.loadReplay(pendingReplay);
    sampler.enabled = false;
    game.start();
  } else {
    screens.showStart(game.seed, storage.best()?.score ?? null);
  }

  game.onDeath = (state) => {
    sampler.enabled = false;
    const run = {
      seed: state.seed,
      score: state.score,
      ticks: state.tick,
      distance: state.z,
      topSpeed: game.topSpeed,
      date: new Date().toISOString(),
    };
    const best = storage.best()?.score ?? null;
    const { newBest } = storage.recordRun(run);
    window.setTimeout(() => {
      if (game.phase !== 'dead') return;
      screens.showRunOver({ ...run, best: newBest ? run.score : best, newBest });
    }, 600);
  };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyR' && game.phase !== 'idle') {
      e.preventDefault();
      begin(game.seed);
      return;
    }
    if (e.code === 'KeyN' && game.phase !== 'idle') {
      e.preventDefault();
      begin(randomSeed());
      return;
    }
    if (e.code === 'Enter' && game.phase === 'dead') {
      e.preventDefault();
      begin(game.seed);
      return;
    }
    if (game.phase === 'running' && sampler.keyDown(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    if (sampler.keyUp(e.code)) e.preventDefault();
  });
  window.addEventListener('blur', () => sampler.releaseAll());
  canvas.addEventListener('click', () => {
    if (game.phase === 'running') requestLock(canvas);
  });
  document.addEventListener('pointerlockchange', () => {
    if (!isLocked(canvas)) sampler.releaseAll();
  });
  window.addEventListener('mousemove', (e) => {
    if (isLocked(canvas) && game.phase === 'running') sampler.mouseMove(e.movementX, e.movementY);
  });

  await game.settle();
  let last = performance.now();
  let acc = 0;
  const frame = (now: number): void => {
    const a = advance(acc, now - last);
    last = now;
    acc = a.acc;
    if (game.phase === 'idle') {
      game.world.update(game.state.z);
      game.render(1);
    } else {
      if (a.ticks > 0) game.step(a.ticks);
      else game.world.update(game.state.z);
      game.render(a.ticks > 0 ? a.alpha : 1);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    game.renderer.resize(canvas.width, canvas.height);
  });
}
