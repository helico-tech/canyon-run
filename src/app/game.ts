// Game object: owns the sim state, the world ring and the renderer. Input comes
// from a source: the player's sampler, the scripted pilot, or a replay.
import { atmosphereFor } from '../render/atmosphere.ts';
import type { RenderPose } from '../render/camera.ts';
import { Renderer } from '../render/renderer.ts';
import { C } from '../sim/constants.ts';
import type { InputFrame } from '../sim/input.ts';
import { ZERO_INPUT } from '../sim/input.ts';
import { createPilot } from '../sim/pilot.ts';
import { decodeRuns, isReplay } from '../sim/replay.ts';
import { checksum, cloneState, copyState, createState } from '../sim/state.ts';
import type { SimState } from '../sim/state.ts';
import { step, StepScratch } from '../sim/step.ts';
import { CANYON_PALETTE } from '../terrain/palette.ts';
import { World } from './world.ts';

export interface GameOptions {
  seed: number;
  width: number;
  height: number;
  preserveDrawingBuffer?: boolean;
}

export type InputSource = (s: SimState) => InputFrame;

export class Game {
  readonly renderer: Renderer;
  readonly world: World;
  state: SimState;
  /** State before the last tick, for render interpolation. */
  prev: SimState;
  private scratch: StepScratch;
  private source: InputSource;
  private forcedInput: InputFrame | null = null;
  frames = 0;

  constructor(canvas: HTMLCanvasElement, opts: GameOptions) {
    this.renderer = new Renderer(canvas, {
      width: opts.width,
      height: opts.height,
      preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
    });
    this.renderer.setAtmosphere(atmosphereFor(CANYON_PALETTE));
    this.state = createState(opts.seed);
    this.prev = cloneState(this.state);
    this.scratch = new StepScratch(opts.seed);
    this.source = createPilot(opts.seed);
    this.world = new World(opts.seed, this.renderer);
    this.world.update(this.state.z);
  }

  get seed(): number {
    return this.state.seed;
  }

  /** Replaces the input source (player sampler, pilot, replay). */
  setSource(source: InputSource): void {
    this.source = source;
    this.forcedInput = null;
  }

  usePilot(): void {
    this.setSource(createPilot(this.state.seed));
  }

  /** Fixed input for the next ticks (null = current source). */
  setInput(input: InputFrame | null): void {
    this.forcedInput = input;
  }

  /** Feeds a replay's inputs tick by tick (zero input after it ends). The seed must match. */
  loadReplay(replay: unknown): void {
    if (!isReplay(replay)) throw new Error('not a replay');
    if (replay.seed !== this.state.seed)
      throw new Error(`replay seed ${replay.seed} != game seed ${this.state.seed}`);
    const frames = decodeRuns(replay.runs);
    this.setSource(() => {
      const next = frames.next();
      return next.done ? ZERO_INPUT : next.value;
    });
  }

  /** One tick with the given input; the render interpolates from the previous state. */
  tick(input: InputFrame): void {
    copyState(this.prev, this.state);
    step(this.state, input, this.scratch);
  }

  /** n ticks using the forced input or the current source, then a ring update. */
  step(n = 1): void {
    for (let i = 0; i < n; i++) this.tick(this.forcedInput ?? this.source(this.state));
    this.world.update(this.state.z);
  }

  /** Waits until the chunk ring around the plane is complete (test mode). */
  settle(): Promise<void> {
    return this.world.settle(this.state.z);
  }

  /** Interpolated pose: lerp position, nlerp orientation. alpha = 1 is the current state. */
  pose(alpha = 1): RenderPose {
    const a = this.prev;
    const b = this.state;
    const t = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
    let qx = a.qx;
    let qy = a.qy;
    let qz = a.qz;
    let qw = a.qw;
    const dot = qx * b.qx + qy * b.qy + qz * b.qz + qw * b.qw;
    const sign = dot < 0 ? -1 : 1;
    qx += (sign * b.qx - qx) * t;
    qy += (sign * b.qy - qy) * t;
    qz += (sign * b.qz - qz) * t;
    qw += (sign * b.qw - qw) * t;
    const inv = 1 / Math.hypot(qx, qy, qz, qw);
    const speed = a.speed + (b.speed - a.speed) * t;
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
      qx: qx * inv,
      qy: qy * inv,
      qz: qz * inv,
      qw: qw * inv,
      tV: (speed - C.MIN_SPEED) / (C.MAX_SPEED - C.MIN_SPEED),
    };
  }

  render(alpha = 1): void {
    this.renderer.render(this.pose(alpha));
    this.frames++;
  }

  snapshot(): Record<string, number | string> {
    const s = this.state;
    return {
      tick: s.tick,
      alive: s.alive,
      x: s.x,
      y: s.y,
      z: s.z,
      speed: s.speed,
      throttle: s.throttle,
      pitchRate: s.pitchRate,
      rollRate: s.rollRate,
      score: s.score,
      proximity: s.proximity,
      checksum: (checksum(s) >>> 0).toString(16).padStart(8, '0'),
    };
  }
}
