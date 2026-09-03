// Start overlay and run-over panel (research 05 §5.4). DOM only.
import { formatSeed } from './seed.ts';
import type { Settings } from './settings.ts';

export interface RunOverData {
  score: number;
  ticks: number;
  distance: number;
  topSpeed: number;
  seed: number;
  best: number | null;
  newBest: boolean;
}

export interface Screens {
  showStart(seed: number, best: number | null, biome?: string): void;
  setBiomes(names: string[]): void;
  readonly biomeValue: string;
  hideStart(): void;
  showRunOver(data: RunOverData): void;
  hideRunOver(): void;
  onStart(handler: (seedText: string, biome: string) => void): void;
  /** Fills the settings controls; onSettings fires on every change. */
  setSettings(s: Settings): void;
  onSettings(handler: (s: Settings) => void): void;
  onCopyReplay(handler: () => Promise<boolean>): void;
  readonly startVisible: boolean;
  readonly runOverVisible: boolean;
}

function el(tag: string, cls: string, html = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export function createScreens(parent: HTMLElement): Screens {
  const start = el('div', 'screen start');
  start.innerHTML = `
    <div class="card">
      <h1>Canyon Run</h1>
      <p class="sub">fly fast, stay low, do not touch the rock</p>
      <label>seed <input class="seed" spellcheck="false" maxlength="9" /></label>
      <label>biome <select class="biome"></select></label>
      <div class="settings">
        <label>sensitivity <input class="sens" type="range" min="0.5" max="2" step="0.1" /> <span class="sensv">1.0</span></label>
        <label><input class="invert" type="checkbox" /> invert Y</label>
        <label><input class="thrws" type="checkbox" /> W/S throttle</label>
      </div>
      <p class="best"></p>
      <ul class="keys">
        <li><b>mouse</b> pitch / roll <b>W S</b> push / pull <b>A D</b> roll <b>Q E</b> yaw</li>
        <li><b>Shift / Ctrl</b> throttle <b>R</b> restart <b>N</b> new canyon <b>Esc</b> release</li>
      </ul>
      <p class="cta">click to fly</p>
    </div>`;
  const over = el('div', 'screen over');
  over.innerHTML = `
    <div class="card">
      <h2>Run over</h2>
      <div class="score"><span class="value">0</span><span class="tag"></span></div>
      <table>
        <tr><td>time</td><td class="time"></td><td>top speed</td><td class="top"></td></tr>
        <tr><td>distance</td><td class="dist"></td><td>best</td><td class="bestv"></td></tr>
      </table>
      <p class="seed"></p>
      <p class="cta"><b>R</b> fly again · <b>N</b> new canyon</p>
      <button class="copy" type="button">copy replay</button>
    </div>`;
  start.hidden = true;
  over.hidden = true;
  parent.append(start, over);
  const seedInput = start.querySelector<HTMLInputElement>('.seed')!;
  const biomeSelect = start.querySelector<HTMLSelectElement>('.biome')!;
  biomeSelect.addEventListener('click', (e) => e.stopPropagation());
  biomeSelect.addEventListener('keydown', (e) => e.stopPropagation());
  const startBest = start.querySelector<HTMLElement>('.best')!;
  const sens = start.querySelector<HTMLInputElement>('.sens')!;
  const sensValue = start.querySelector<HTMLElement>('.sensv')!;
  const invert = start.querySelector<HTMLInputElement>('.invert')!;
  const thrws = start.querySelector<HTMLInputElement>('.thrws')!;
  let settingsHandler: ((s: Settings) => void) | null = null;
  const readSettings = (): Settings => ({
    sensitivity: Number(sens.value),
    invertY: invert.checked,
    throttleWS: thrws.checked,
  });
  for (const input of [sens, invert, thrws]) {
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => e.stopPropagation());
    input.addEventListener('input', () => {
      sensValue.textContent = Number(sens.value).toFixed(1);
      settingsHandler?.(readSettings());
    });
  }
  let startHandler: ((seedText: string, biome: string) => void) | null = null;
  start.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('input, select, label')) return;
    startHandler?.(seedInput.value, biomeSelect.value);
  });
  seedInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') startHandler?.(seedInput.value, biomeSelect.value);
  });
  const q = (root: HTMLElement, sel: string): HTMLElement => root.querySelector<HTMLElement>(sel)!;
  const copyBtn = over.querySelector<HTMLButtonElement>('.copy')!;
  let copyHandler: (() => Promise<boolean>) | null = null;
  copyBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const ok = copyHandler ? await copyHandler() : false;
    copyBtn.textContent = ok ? 'copied' : 'copy failed';
    window.setTimeout(() => (copyBtn.textContent = 'copy replay'), 1500);
  });
  return {
    onCopyReplay(handler) {
      copyHandler = handler;
    },
    get startVisible() {
      return !start.hidden;
    },
    get runOverVisible() {
      return !over.hidden;
    },
    onStart(handler) {
      startHandler = handler;
    },
    setSettings(s) {
      sens.value = String(s.sensitivity);
      sensValue.textContent = s.sensitivity.toFixed(1);
      invert.checked = s.invertY;
      thrws.checked = s.throttleWS;
    },
    onSettings(handler) {
      settingsHandler = handler;
    },
    get biomeValue() {
      return biomeSelect.value;
    },
    setBiomes(names) {
      biomeSelect.innerHTML = names.map((n) => `<option value="${n}">${n}</option>`).join('');
    },
    showStart(seed, best, biome = 'auto') {
      seedInput.value = formatSeed(seed);
      biomeSelect.value = biome;
      startBest.textContent =
        best === null ? 'no runs yet' : `best ${Math.floor(best / 1000).toLocaleString('en-US')}`;
      start.hidden = false;
    },
    hideStart() {
      start.hidden = true;
    },
    showRunOver(d) {
      q(over, '.value').textContent = Math.floor(d.score / 1000).toLocaleString('en-US');
      q(over, '.tag').textContent = d.newBest ? 'new best' : '';
      q(over, '.time').textContent = `${(d.ticks / 60).toFixed(1)} s`;
      q(over, '.top').textContent = `${Math.round(d.topSpeed)} u/s`;
      q(over, '.dist').textContent = `${Math.round(d.distance)} u`;
      q(over, '.bestv').textContent =
        d.best === null ? '-' : Math.floor(d.best / 1000).toLocaleString('en-US');
      q(over, '.seed').textContent = `seed ${formatSeed(d.seed)}`;
      over.hidden = false;
    },
    hideRunOver() {
      over.hidden = true;
    },
  };
}
