// Replay format v1 (spec §5.4): seed + RLE input runs + checkpoints. The
// validator re-simulates and never trusts the claimed score.
import { C, hashConstants } from './constants.ts';
import { hex32 } from './hash.ts';
import type { InputFrame } from './input.ts';
import { KEY_MASK, ZERO_INPUT } from './input.ts';
import type { SimState } from './state.ts';
import { checksum, createState } from './state.ts';
import { step, StepScratch } from './step.ts';
import { SIM_VERSION } from './version.ts';

export const REPLAY_FORMAT = 'canyon-replay/1';
export const CHECKPOINT_EVERY = 60;

/** [count, keys, dx, dy] */
export type Run = [number, number, number, number];
/** [tick, fnv1a32 hex] */
export type Checkpoint = [number, string];

export interface Replay {
  format: string;
  simVersion: string;
  constantsHash: string;
  tickRate: number;
  seed: number;
  /** Biome mode (0 auto); absent in files recorded before it existed. */
  biomeMode?: number;
  ticks: number;
  finalScore: number;
  finalChecksum: string;
  runs: Run[];
  checkpoints: Checkpoint[];
  meta?: Record<string, unknown>;
}

export function encodeRuns(inputs: Iterable<InputFrame>): Run[] {
  const runs: Run[] = [];
  let last: Run | null = null;
  for (const { keys, dx, dy } of inputs) {
    if (last && last[1] === keys && last[2] === dx && last[3] === dy && last[0] < 65535) last[0]++;
    else runs.push((last = [1, keys, dx, dy]));
  }
  return runs;
}

export function* decodeRuns(runs: Iterable<Run>): Generator<InputFrame> {
  for (const [n, keys, dx, dy] of runs) for (let i = 0; i < n; i++) yield { keys, dx, dy };
}

/**
 * Input source for playback: the replay's inputs for exactly `ticks` frames,
 * then zero input, mirroring what the validator simulates (trailing runs are
 * never played).
 */
export function replaySource(r: Replay): () => InputFrame {
  const frames = decodeRuns(r.runs);
  let fed = 0;
  return () => {
    if (fed >= r.ticks) return ZERO_INPUT;
    fed++;
    const next = frames.next();
    return next.done ? ZERO_INPUT : next.value;
  };
}

export function runsLength(runs: Run[]): number {
  let n = 0;
  for (const r of runs) n += r[0];
  return n;
}

/** Records inputs and checkpoints while a run is being simulated. */
export class Recorder {
  readonly seed: number;
  readonly biomeMode: number;
  private readonly runs: Run[] = [];
  private last: Run | null = null;
  private readonly checkpoints: Checkpoint[] = [];
  private ticks = 0;

  constructor(seed: number, biomeMode = 0) {
    this.seed = seed >>> 0;
    this.biomeMode = biomeMode;
  }

  /** Call after `step(state, input)`. */
  push(input: InputFrame, stateAfter: SimState): void {
    const keys = input.keys & KEY_MASK;
    const l = this.last;
    if (l && l[1] === keys && l[2] === input.dx && l[3] === input.dy && l[0] < 65535) l[0]++;
    else this.runs.push((this.last = [1, keys, input.dx, input.dy]));
    this.ticks++;
    if (stateAfter.tick % CHECKPOINT_EVERY === 0)
      this.checkpoints.push([stateAfter.tick, hex32(checksum(stateAfter))]);
  }

  get length(): number {
    return this.ticks;
  }

  finish(stateAfter: SimState, meta?: Record<string, unknown>): Replay {
    const cps = this.checkpoints.slice();
    if (cps.length === 0 || cps[cps.length - 1]![0] !== stateAfter.tick)
      cps.push([stateAfter.tick, hex32(checksum(stateAfter))]);
    return {
      format: REPLAY_FORMAT,
      simVersion: SIM_VERSION,
      constantsHash: hex32(hashConstants()),
      tickRate: C.TICK_RATE,
      seed: this.seed,
      biomeMode: this.biomeMode,
      ticks: this.ticks,
      finalScore: stateAfter.score,
      finalChecksum: hex32(checksum(stateAfter)),
      runs: this.runs.map((r) => [...r] as Run),
      checkpoints: cps,
      ...(meta ? { meta } : {}),
    };
  }
}

export type Verdict =
  | { verdict: 'ok'; score: number; checksum: string; ticks: number; state: SimState }
  | { verdict: 'score-mismatch'; claimed: number; computed: number }
  | { verdict: 'checkpoint-mismatch'; tick: number; claimed: string; computed: string }
  | { verdict: 'version-mismatch'; detail: string }
  | { verdict: 'malformed'; detail: string };

export function isReplay(v: unknown): v is Replay {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    r.format === REPLAY_FORMAT &&
    typeof r.simVersion === 'string' &&
    typeof r.constantsHash === 'string' &&
    typeof r.seed === 'number' &&
    typeof r.ticks === 'number' &&
    typeof r.finalScore === 'number' &&
    typeof r.finalChecksum === 'string' &&
    Array.isArray(r.runs) &&
    Array.isArray(r.checkpoints)
  );
}

/**
 * Re-simulates a replay. Options: `onTick(state, tick)` for observers (renderers,
 * frame dumps); `scratch` to reuse a StepScratch.
 */
export function simulateReplay(
  r: Replay,
  opts: { onTick?: (s: SimState, tick: number) => void; scratch?: StepScratch } = {},
): Verdict {
  if (!isReplay(r)) return { verdict: 'malformed', detail: 'missing fields or wrong format' };
  if (r.simVersion !== SIM_VERSION)
    return { verdict: 'version-mismatch', detail: `simVersion ${r.simVersion} != ${SIM_VERSION}` };
  const ch = hex32(hashConstants());
  if (r.constantsHash !== ch)
    return { verdict: 'version-mismatch', detail: `constantsHash ${r.constantsHash} != ${ch}` };
  if (r.tickRate !== C.TICK_RATE)
    return { verdict: 'version-mismatch', detail: `tickRate ${r.tickRate} != ${C.TICK_RATE}` };
  const shape = checkShape(r);
  if (shape) return { verdict: 'malformed', detail: shape };
  if (runsLength(r.runs) < r.ticks)
    return { verdict: 'malformed', detail: 'fewer inputs than ticks' };
  const cps = new Map<number, string>();
  for (const [t, h] of r.checkpoints) cps.set(t, h);
  const mode = r.biomeMode ?? 0;
  const state = createState(r.seed, mode);
  const scratch = opts.scratch ?? new StepScratch(r.seed, { mode });
  let tick = 0;
  for (const input of decodeRuns(r.runs)) {
    if (tick >= r.ticks) break;
    step(state, input, scratch);
    tick++;
    opts.onTick?.(state, tick);
    const claimed = cps.get(tick);
    if (claimed !== undefined) {
      const computed = hex32(checksum(state));
      if (claimed !== computed) return { verdict: 'checkpoint-mismatch', tick, claimed, computed };
    }
  }
  const finalChecksum = hex32(checksum(state));
  if (finalChecksum !== r.finalChecksum)
    return {
      verdict: 'checkpoint-mismatch',
      tick,
      claimed: r.finalChecksum,
      computed: finalChecksum,
    };
  if (state.score !== r.finalScore)
    return { verdict: 'score-mismatch', claimed: r.finalScore, computed: state.score };
  return { verdict: 'ok', score: state.score, checksum: finalChecksum, ticks: tick, state };
}

/** Structural validation of runs and checkpoints; returns a reason or null. */
export function checkShape(r: Replay): string | null {
  if (!Number.isInteger(r.ticks) || r.ticks < 0) return 'ticks must be a non-negative integer';
  if (r.biomeMode !== undefined && !Number.isInteger(r.biomeMode)) return 'bad biomeMode';
  for (const run of r.runs) {
    if (!Array.isArray(run) || run.length !== 4) return 'bad run';
    if (run.some((v) => !Number.isInteger(v))) return 'bad run';
    if (run[0] < 1 || run[0] > 65535) return 'bad run count';
    if ((run[1] & ~KEY_MASK) !== 0) return 'reserved key bits set';
    if (run[2] < -32768 || run[2] > 32767 || run[3] < -32768 || run[3] > 32767)
      return 'mouse delta out of range';
  }
  for (const cp of r.checkpoints) {
    if (
      !Array.isArray(cp) ||
      cp.length !== 2 ||
      !Number.isInteger(cp[0]) ||
      typeof cp[1] !== 'string'
    )
      return 'bad checkpoint';
  }
  return null;
}

export const validateReplay = simulateReplay;

/**
 * Reference simulation for tooling: plays `ticks` ticks of a replay (zero input
 * after the recording ends, like the browser) and returns the final state.
 */
export function simulateTicks(
  r: Replay,
  ticks: number,
  opts: { onTick?: (s: SimState, tick: number) => void } = {},
): SimState {
  const mode = r.biomeMode ?? 0;
  const state = createState(r.seed, mode);
  const scratch = new StepScratch(r.seed, { mode });
  const frames = decodeRuns(r.runs);
  for (let tick = 1; tick <= ticks; tick++) {
    const next = frames.next();
    step(state, next.done ? { keys: 0, dx: 0, dy: 0 } : next.value, scratch);
    opts.onTick?.(state, tick);
  }
  return state;
}

/** Drives a policy for `ticks` ticks and returns the replay. */
export function recordRun(
  seed: number,
  ticks: number,
  policy: (s: SimState) => InputFrame,
  meta?: Record<string, unknown>,
  biomeMode = 0,
): { replay: Replay; state: SimState } {
  const state = createState(seed, biomeMode);
  const rec = new Recorder(seed, biomeMode);
  const scratch = new StepScratch(seed, { mode: biomeMode });
  for (let i = 0; i < ticks; i++) {
    const input = policy(state);
    step(state, input, scratch);
    rec.push(input, state);
  }
  return { replay: rec.finish(state, meta), state };
}
