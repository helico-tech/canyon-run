// Game object: owns the sim state, the world ring and the renderer. Input comes
// from a source: the player's sampler, the scripted pilot, or a replay.
import { atmosphereFor, atmosphereAtZ } from '../render/atmosphere.ts';
import type { RenderPose } from '../render/camera.ts';
import { Renderer } from '../render/renderer.ts';
import type { GameRenderer } from '../render/renderer.ts';
import { NullRenderer } from '../render/nullRenderer.ts';
import { C } from '../sim/constants.ts';
import type { InputFrame } from '../sim/input.ts';
import { ZERO_INPUT } from '../sim/input.ts';
import { createPilot } from '../sim/pilot.ts';
import { decodeRuns, isReplay, Recorder } from '../sim/replay.ts';
import type { Replay } from '../sim/replay.ts';
import { checksum, cloneState, copyState, createState } from '../sim/state.ts';
import { basis } from '../sim/quat.ts';
import type { SimState } from '../sim/state.ts';
import { step, StepScratch } from '../sim/step.ts';
import { CANYON_PALETTE } from '../terrain/palette.ts';
import { World } from './world.ts';

export interface GameOptions {
  seed: number;
  width: number;
  height: number;
  preserveDrawingBuffer?: boolean;
  /** Sim only, no WebGL (cross-engine tests). */
  nogl?: boolean;
  /** Terrain worker count override (benchmarks). */
  workers?: number;
}

export type InputSource = (s: SimState) => InputFrame;
export type Phase = 'idle' | 'running' | 'dead';

export class Game {
  readonly renderer: GameRenderer;
  readonly world: World;
  state: SimState;
  /** State before the last tick, for render interpolation. */
  prev: SimState;
  private scratch: StepScratch;
  private source: InputSource;
  private forcedInput: InputFrame | null = null;
  frames = 0;
  /** Called after every render with the interpolated state (HUD hook). */
  onRender: ((state: SimState, alpha: number) => void) | null = null;
  /** Called once when the plane dies. */
  onDeath: ((state: SimState) => void) | null = null;
  replayLabel: string | null = null;
  phase: Phase = 'idle';
  topSpeed = 0;
  /** Tick at which the plane died, and its velocity then (for the death camera). */
  deathTick = -1;
  private deathVel = new Float64Array(3);
  private readonly deathBasis = new Float64Array(9);
  private recorder: Recorder;

  constructor(canvas: HTMLCanvasElement, opts: GameOptions) {
    this.renderer = opts.nogl
      ? new NullRenderer()
      : new Renderer(canvas, {
          width: opts.width,
          height: opts.height,
          preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
        });
    this.renderer.setSeed(opts.seed);
    this.renderer.setAtmosphere(atmosphereFor(CANYON_PALETTE));
    this.state = createState(opts.seed);
    this.prev = cloneState(this.state);
    this.scratch = new StepScratch(opts.seed);
    this.source = createPilot(opts.seed);
    this.recorder = new Recorder(opts.seed);
    this.world = new World(opts.seed, this.renderer, opts.workers);
    this.world.update(this.state.z);
  }

  /** The current run as a replay (valid for the validator at any point). */
  replay(meta?: Record<string, unknown>): Replay {
    return this.recorder.finish(this.state, meta);
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
    this.replayLabel = `replay ${replay.ticks} ticks`;
    this.setSource(() => {
      const next = frames.next();
      return next.done ? ZERO_INPUT : next.value;
    });
  }

  /** One tick with the given input; the render interpolates from the previous state. */
  tick(input: InputFrame): void {
    copyState(this.prev, this.state);
    step(this.state, input, this.scratch);
    this.recorder.push(input, this.state);
    if (this.state.speed > this.topSpeed) this.topSpeed = this.state.speed;
    if (this.state.alive === 0 && this.phase !== 'dead') {
      this.phase = 'dead';
      this.deathTick = this.state.tick;
      basis(this.state.qx, this.state.qy, this.state.qz, this.state.qw, this.deathBasis);
      this.deathVel[0] = this.deathBasis[6]! * this.state.speed;
      this.deathVel[1] = this.deathBasis[7]! * this.state.speed;
      this.deathVel[2] = this.deathBasis[8]! * this.state.speed;
      const a = atmosphereAtZ(this.state.seed, this.state.z);
      const accent = a.accent ?? [1, 1, 1];
      this.renderer.spawnShards(
        this.state.seed ^ this.state.tick,
        this.state.x,
        this.state.y,
        this.state.z,
        this.deathVel[0],
        this.deathVel[1],
        this.deathVel[2],
        [accent[0] / 255, accent[1] / 255, accent[2] / 255],
      );
      this.onDeath?.(this.state);
    }
  }

  start(): void {
    if (this.phase === 'idle') this.phase = 'running';
  }

  /** New run on `seed` (same seed keeps the chunk cache). Under 300 ms either way. */
  restart(seed: number = this.state.seed): void {
    const s = seed >>> 0;
    this.state = createState(s);
    this.prev = cloneState(this.state);
    this.scratch = new StepScratch(s);
    this.recorder = new Recorder(s);
    this.topSpeed = 0;
    this.deathTick = -1;
    this.renderer.clearShards();
    this.replayLabel = null;
    this.forcedInput = null;
    this.world.reset(s);
    this.world.update(this.state.z);
    this.renderer.setSeed(s);
    this.phase = 'running';
  }

  /** Test hook: disables hull collision (proximity and events still run). */
  setGhost(on: boolean): void {
    this.scratch.ghost = on;
  }

  /** Test hook: moves the plane (collision is evaluated on the next tick). */
  teleport(x: number, y: number, z: number): void {
    this.state.x = x;
    this.state.y = y;
    this.state.z = z;
    copyState(this.prev, this.state);
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
    let inv = 1 / Math.hypot(qx, qy, qz, qw);
    const speed = a.speed + (b.speed - a.speed) * t;
    let x = a.x + (b.x - a.x) * t;
    let y = a.y + (b.y - a.y) * t;
    let z = a.z + (b.z - a.z) * t;
    let deadFor = 0;
    if (this.phase === 'dead' && this.deathTick >= 0) {
      // Death camera: hitstop for 90 ms, then drift with decaying velocity and a hashed tumble.
      deadFor = Math.max(0, b.tick + t - this.deathTick) / 60;
      const td = Math.max(0, deadFor - 0.09);
      const drift = 0.6 * (1 - Math.exp(-td / 0.6));
      x += this.deathVel[0]! * drift;
      y += this.deathVel[1]! * drift;
      z += this.deathVel[2]! * drift;
      const h = (this.state.seed ^ this.deathTick) >>> 0;
      const ax = ((h & 255) / 255) * 2 - 1;
      const ay = (((h >>> 8) & 255) / 255) * 2 - 1;
      const az = (((h >>> 16) & 255) / 255) * 2 - 1;
      const al = Math.hypot(ax, ay, az) || 1;
      const rate = (1.05 + 1.05 * (((h >>> 24) & 255) / 255)) * Math.exp(-td / 0.6); // 60–120 deg/s, decaying
      const angle = rate * 0.6 * (1 - Math.exp(-td / 0.6));
      const sh = Math.sin(angle / 2);
      const tqx = (ax / al) * sh;
      const tqy = (ay / al) * sh;
      const tqz = (az / al) * sh;
      const tqw = Math.cos(angle / 2);
      // q ⊗ tumble
      const nx = qw * tqx + qx * tqw + qy * tqz - qz * tqy;
      const ny = qw * tqy - qx * tqz + qy * tqw + qz * tqx;
      const nz = qw * tqz + qx * tqy - qy * tqx + qz * tqw;
      const nw = qw * tqw - qx * tqx - qy * tqy - qz * tqz;
      qx = nx;
      qy = ny;
      qz = nz;
      qw = nw;
      inv = 1 / Math.hypot(qx, qy, qz, qw);
    }
    return {
      x,
      y,
      z,
      qx: qx * inv,
      qy: qy * inv,
      qz: qz * inv,
      qw: qw * inv,
      tV: (speed - C.MIN_SPEED) / (C.MAX_SPEED - C.MIN_SPEED),
      rollRate: a.rollRate + (b.rollRate - a.rollRate) * t,
      pitchRate: a.pitchRate + (b.pitchRate - a.pitchRate) * t,
      yawRate: a.yawRate + (b.yawRate - a.yawRate) * t,
      proximity: a.proximity + (b.proximity - a.proximity) * t,
      time: a.tick + t,
      speed,
      deadFor,
    };
  }

  render(alpha = 1): void {
    this.renderer.setAtmosphere(atmosphereAtZ(this.state.seed, this.state.z));
    this.renderer.render(this.pose(alpha));
    this.frames++;
    this.onRender?.(this.state, alpha);
  }

  snapshot(): Record<string, number | string> {
    const s = this.state;
    return {
      phase: this.phase,
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
      streakTicks: s.streakTicks,
      eventId: s.eventId,
      eventPoints: s.eventPoints,
      checksum: (checksum(s) >>> 0).toString(16).padStart(8, '0'),
    };
  }
}
