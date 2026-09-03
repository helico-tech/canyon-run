// Semantic gates on a headless run (ADR 0003). Each check is cheap and
// rasterizer-independent; exact regression uses frame hashes separately.
import type { FrameStats } from './stats.ts';

export interface FrameRecord {
  frame: number;
  tick: number;
  hash: string;
  checksum: string;
  alive: number;
}

export interface GateInput {
  stats: Array<{ frame: number; stats: FrameStats }>;
  frames: FrameRecord[];
  consoleErrors: string[];
  nodeChecksum: string | null;
  /** Last dumped page frame, to check the HUD frame is drawn. */
  hudAnchor?: { width: number; height: number; data: Uint8Array };
}

export interface GateResult {
  name: string;
  ok: boolean;
  detail: string;
}

export function runGates(g: GateInput): GateResult[] {
  const out: GateResult[] = [];
  const add = (name: string, ok: boolean, detail: string): void => {
    out.push({ name, ok, detail });
  };
  let maxFog = 0;
  for (const { frame, stats: s } of g.stats) {
    const tag = `frame ${frame}`;
    maxFog = Math.max(maxFog, s.fogFraction);
    // Structure in the bottom quarter: fogged dark floors can match the fog colour, edges cannot.
    add(
      `${tag}: terrain in bottom band`,
      s.bottomEdgePct > 0.3,
      `bottom edge density ${s.bottomEdgePct} %`,
    );
    // A single-biome palette quantises to ~80-120 colours at 4 bits; a flat or black frame to a handful.
    add(
      `${tag}: colour variety`,
      s.uniqueColours16 > 40,
      `${s.uniqueColours16} unique 4-bit colours`,
    );
    add(
      `${tag}: edge density`,
      s.edgeDensityPct > 1 && s.edgeDensityPct < 40,
      `${s.edgeDensityPct} %`,
    );
    add(`${tag}: exposure`, s.meanLum > 20 && s.meanLum < 200, `mean luminance ${s.meanLum}`);
  }
  if (g.stats.length)
    add('horizon glow visible in the run', maxFog > 0.003, `max fog fraction ${maxFog}`);
  const first = g.frames[0];
  const later = g.frames.find((f) => f.frame >= 60) ?? g.frames[g.frames.length - 1];
  if (first && later && later !== first) {
    add(
      'temporal change',
      first.hash !== later.hash,
      `${first.hash} vs ${later.hash} at frame ${later.frame}`,
    );
  }
  add(
    'no console errors',
    g.consoleErrors.length === 0,
    g.consoleErrors.slice(0, 3).join(' | ') || 'none',
  );
  const last = g.frames[g.frames.length - 1];
  if (g.nodeChecksum && last) {
    add(
      'sim checksum equals Node',
      last.checksum === g.nodeChecksum,
      `${last.checksum} vs ${g.nodeChecksum}`,
    );
  }
  return out;
}
