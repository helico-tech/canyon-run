// Bootstrap game object: owns the sim state, the world ring and the renderer.
// CR-0012 adds the real-time loop and input; for now the scripted pilot flies.
import { atmosphereFor } from '../render/atmosphere.ts';
import type { RenderPose } from '../render/camera.ts';
import { Renderer } from '../render/renderer.ts';
import { C } from '../sim/constants.ts';
import type { InputFrame } from '../sim/input.ts';
import { createPilot } from '../sim/pilot.ts';
import { decodeRuns, isReplay } from '../sim/replay.ts';
import { ZERO_INPUT } from '../sim/input.ts';
import { checksum, createState } from '../sim/state.ts';
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

export class Game {
  readonly renderer: Renderer;
  readonly world: World;
  state: SimState;
  private scratch: StepScratch;
  private pilot: (s: SimState) => InputFrame;
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
    this.scratch = new StepScratch(opts.seed);
    this.pilot = createPilot(opts.seed);
    this.world = new World(opts.seed, this.renderer);
    this.world.update(this.state.z);
  }

  get seed(): number {
    return this.state.seed;
  }

  /** Fixed input for the next ticks (null = scripted pilot). */
  setInput(input: InputFrame | null): void {
    this.forcedInput = input;
  }

  /** Feeds a replay's inputs tick by tick (zero input after it ends). The seed must match. */
  loadReplay(replay: unknown): void {
    if (!isReplay(replay)) throw new Error('not a replay');
    if (replay.seed !== this.state.seed)
      throw new Error(`replay seed ${replay.seed} != game seed ${this.state.seed}`);
    const frames = decodeRuns(replay.runs);
    this.forcedInput = null;
    this.pilot = () => {
      const next = frames.next();
      return next.done ? ZERO_INPUT : next.value;
    };
  }

  step(n = 1): void {
    for (let i = 0; i < n; i++) {
      const input = this.forcedInput ?? this.pilot(this.state);
      step(this.state, input, this.scratch);
    }
    this.world.update(this.state.z);
  }

  /** Waits until the chunk ring around the plane is complete (test mode). */
  settle(): Promise<void> {
    return this.world.settle(this.state.z);
  }

  pose(): RenderPose {
    const s = this.state;
    const tV = (s.speed - C.MIN_SPEED) / (C.MAX_SPEED - C.MIN_SPEED);
    return { x: s.x, y: s.y, z: s.z, qx: s.qx, qy: s.qy, qz: s.qz, qw: s.qw, tV };
  }

  render(): void {
    this.renderer.render(this.pose());
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
      score: s.score,
      proximity: s.proximity,
      checksum: (checksum(s) >>> 0).toString(16).padStart(8, '0'),
    };
  }
}
