// Minimal cockpit HUD as a DOM overlay (research 05 §3). Transforms and text only.
import { C } from '../sim/constants.ts';
import type { SimState } from '../sim/state.ts';
import { basis } from '../sim/quat.ts';
import { scoreFactor, scoreRate } from '../sim/step.ts';
import { formatSeed } from './seed.ts';

export interface HudView {
  /** Normalised altitude in the corridor: 0 floor, 1 ceiling clamp. */
  altitude: number;
  /** Proximity per side [left, right, up, down] in [0, 1]. */
  glow: [number, number, number, number];
  replayLabel: string | null;
  /** Name of the biome of the current segment. */
  biome: string;
  /** Distance to the next gate in u while inside the cue range, else -1. */
  gateIn: number;
}

export interface Hud {
  root: HTMLElement;
  update(state: SimState, view: HudView, nowMs: number): void;
  setSeed(seed: number, biome?: string): void;
}

const TEXT_INTERVAL_MS = 1000 / 15;

function el(tag: string, cls: string, text = ''): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export const EVENT_NAMES = ['', 'close', 'so close', 'threaded', 'gate', 'dodged'];

export interface HudOptions {
  /** Shows a frame-rate readout (top left) for real-display checks. */
  debug?: boolean;
}

export function createHud(parent: HTMLElement, options: HudOptions = {}): Hud {
  const root = el('div', '');
  root.id = 'hud';
  const score = el('div', 'score');
  const scoreValue = el('div', 'value', '0');
  const mult = el('div', 'mult', 'x1.0');
  score.append(scoreValue, mult);
  const speed = el('div', 'speed');
  const speedBar = el('div', 'bar');
  const speedFill = el('div', 'fill');
  speedBar.append(speedFill);
  const speedValue = el('div', 'value', '0');
  speed.append(el('div', 'label', 'speed'), speedBar, speedValue);
  const alt = el('div', 'alt');
  const marker = el('div', 'marker');
  alt.append(
    el('div', 'zone'),
    marker,
    el('div', 'tag ceil', 'ceil'),
    el('div', 'tag floor', 'floor'),
  );
  const horizon = el('div', 'horizon');
  const reticle = el('div', 'reticle');
  const glows = (['l', 'r', 't', 'b'] as const).map((side) => el('div', `glow ${side}`));
  const seedEl = el('div', 'seed', 'seed 0000-0000');
  const biomeEl = el('div', 'biome', '');
  const gateEl = el('div', 'gate', '');
  gateEl.hidden = true;
  const fpsEl = el('div', 'fps', '');
  fpsEl.hidden = options.debug !== true;
  const replay = el('div', 'replay', 'replay');
  replay.hidden = true;
  const dead = el('div', 'dead', 'crashed');
  dead.hidden = true;
  const vignette = el('div', 'vignette');
  const callouts = el('div', 'callouts');
  const flash = el('div', 'flash');
  flash.hidden = true;
  root.append(
    vignette,
    score,
    speed,
    alt,
    horizon,
    reticle,
    ...glows,
    seedEl,
    biomeEl,
    gateEl,
    fpsEl,
    replay,
    dead,
    callouts,
    flash,
  );
  parent.appendChild(root);

  const b = new Float64Array(9);
  let lastText = -Infinity;
  let lastEventTick = -1;
  let lastFrameMs = -Infinity;
  let frameInterval = 1000 / 60;
  let wasAlive = true;
  return {
    root,
    setSeed(seed, biome = 'auto') {
      seedEl.textContent =
        biome === 'auto' ? `seed ${formatSeed(seed)}` : `seed ${formatSeed(seed)} · ${biome}`;
    },
    update(state, view, nowMs) {
      if (lastFrameMs > -Infinity && nowMs > lastFrameMs) {
        // Exponential average of the frame interval; 1/interval is the readout.
        frameInterval += (nowMs - lastFrameMs - frameInterval) * 0.1;
      }
      lastFrameMs = nowMs;
      const tV = Math.min(
        Math.max((state.speed - C.MIN_SPEED) / (C.MAX_SPEED - C.MIN_SPEED), 0),
        1,
      );
      speedFill.style.transform = `scaleX(${tV.toFixed(3)})`;
      vignette.style.opacity = (0.15 + 0.35 * tV).toFixed(3);
      marker.style.top = `${((1 - Math.min(Math.max(view.altitude, 0), 1)) * 100).toFixed(1)}%`;
      basis(state.qx, state.qy, state.qz, state.qw, b);
      // Roll from the right vector (right is -X at level): bank = atan2(-right.y, -right.x).
      const roll = Math.atan2(-b[1]!, -b[0]!);
      const pitch = Math.asin(Math.min(Math.max(b[7]!, -1), 1));
      horizon.style.transform = `translateY(${(pitch * 220).toFixed(1)}px) rotate(${(-roll * 57.2958).toFixed(1)}deg)`;
      for (let i = 0; i < 4; i++) glows[i]!.style.opacity = view.glow[i]!.toFixed(2);
      replay.hidden = view.replayLabel === null;
      dead.hidden = state.alive === 1;
      if (state.alive === 0 && wasAlive) {
        flash.hidden = false;
        flash.classList.remove('go');
        void flash.offsetWidth; // restart the animation
        flash.classList.add('go');
        root.parentElement?.classList.add('dead');
      } else if (state.alive === 1 && !wasAlive) {
        flash.hidden = true;
        root.parentElement?.classList.remove('dead');
      }
      wasAlive = state.alive === 1;
      if (state.eventId !== 0 && state.eventTick !== lastEventTick) {
        lastEventTick = state.eventTick;
        const c = el(
          'div',
          'callout',
          `+${Math.round(state.eventPoints / 1000)} ${EVENT_NAMES[state.eventId] ?? ''}`,
        );
        callouts.prepend(c);
        while (callouts.childElementCount > 2) callouts.lastElementChild?.remove();
        window.setTimeout(() => c.remove(), 900);
      }
      if (nowMs - lastText >= TEXT_INTERVAL_MS) {
        lastText = nowMs;
        scoreValue.textContent = Math.floor(state.score / 1000).toLocaleString('en-US');
        mult.textContent = `x${(scoreRate(state) * scoreFactor(state)).toFixed(1)}`;
        speedValue.textContent = `${Math.round(state.speed)}`;
        if (view.replayLabel !== null) replay.textContent = view.replayLabel;
        biomeEl.textContent = view.biome;
        if (!fpsEl.hidden) fpsEl.textContent = `${Math.round(1000 / frameInterval)} fps`;
        gateEl.hidden = view.gateIn < 0;
        if (view.gateIn >= 0) gateEl.textContent = `gate in ${Math.round(view.gateIn)} u`;
      }
    },
  };
}
