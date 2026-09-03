// Headless/test API (ADR 0003). Installed only when ?test=1 or window.__replay exists.
import type { InputFrame } from '../sim/input.ts';
import { atmosphereAtZ } from '../render/atmosphere.ts';
import type { Game } from './game.ts';

export interface GameTestApi {
  ready: boolean;
  step(n?: number): Promise<Record<string, number | string>>;
  settle(): Promise<Record<string, number | string>>;
  state(): Record<string, number | string>;
  setInput(input: InputFrame | null): void;
  loadReplay(replay: unknown): void;
  teleport(x: number, y: number, z: number): void;
  restart(seed?: number): void;
  replay(): unknown;
  frameHash(): string;
  readPixel(x: number, y: number): [number, number, number, number];
  dataURL(): string;
  /** Fog / horizon colour in force at the plane's z. */
  atmosphere(): { horizon: [number, number, number]; fogDensity: number };
  chunkStats(): {
    resident: number;
    generated: number;
    ms: number;
    triangles: number;
    pending: number;
    slabs: number;
  };
  render(): void;
}

declare global {
  interface Window {
    __game?: GameTestApi;
    __info?: { renderer: string; vendor: string; version: string; simVersion: string };
    __replay?: unknown;
    __errors?: string[];
  }
}

export function isTestMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('test') === '1' || window.__replay !== undefined;
}

export function installTestApi(game: Game, canvas: HTMLCanvasElement, simVersion: string): void {
  window.__errors = [];
  window.addEventListener('error', (e) => window.__errors!.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => window.__errors!.push(String(e.reason)));
  window.__game = {
    ready: true,
    async step(n = 1) {
      game.step(n);
      await game.settle();
      game.render();
      return game.snapshot();
    },
    async settle() {
      await game.settle();
      game.render();
      return game.snapshot();
    },
    state: () => game.snapshot(),
    setInput: (input) => game.setInput(input),
    loadReplay: (replay) => game.loadReplay(replay),
    teleport: (x, y, z) => game.teleport(x, y, z),
    restart: (seed) => game.restart(seed),
    replay: () => game.replay({ recordedBy: 'browser' }),
    frameHash: () => game.renderer.frameHash().toString(16).padStart(8, '0'),
    readPixel: (x, y) => game.renderer.readPixel(x, y),
    dataURL: () => canvas.toDataURL('image/png'),
    chunkStats: () => game.world.stats(),
    atmosphere: () => {
      const a = atmosphereAtZ(game.state.seed, game.state.z);
      return { horizon: [a.horizon[0], a.horizon[1], a.horizon[2]], fogDensity: a.fogDensity };
    },
    render: () => game.render(),
  };
  window.__info = { ...game.renderer.info, simVersion };
}
