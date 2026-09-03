// Procedural audio (research 05 §7): an engine drone and wind that follow the
// speed factor, a blip per score event and a thud on death. Nothing here feeds
// back into the sim; the context is injected so tests can run without sound.
import { C } from '../sim/constants.ts';
import type { SimState } from '../sim/state.ts';

export interface AudioParamLike {
  value: number;
  setTargetAtTime(value: number, startTime: number, timeConstant: number): unknown;
  setValueAtTime(value: number, startTime: number): unknown;
  linearRampToValueAtTime(value: number, endTime: number): unknown;
  exponentialRampToValueAtTime(value: number, endTime: number): unknown;
}
export interface AudioNodeLike {
  connect(destination: AudioNodeLike): unknown;
  disconnect(): unknown;
}
export interface AudioBufferLike {
  length: number;
  sampleRate: number;
  getChannelData(channel: number): Float32Array;
}
export interface AudioContextLike {
  readonly currentTime: number;
  readonly state: AudioContextState;
  readonly destination: AudioNodeLike;
  createGain(): AudioNodeLike & { gain: AudioParamLike };
  createOscillator(): AudioNodeLike & {
    type: OscillatorType;
    frequency: AudioParamLike;
    detune: AudioParamLike;
    start(when?: number): unknown;
    stop(when?: number): unknown;
  };
  createBiquadFilter(): AudioNodeLike & {
    type: BiquadFilterType;
    frequency: AudioParamLike;
    Q: AudioParamLike;
  };
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  createBufferSource(): AudioNodeLike & {
    buffer: AudioBufferLike | null;
    loop: boolean;
    start(when?: number): unknown;
    stop(when?: number): unknown;
  };
  resume(): Promise<void>;
}

export interface GameAudio {
  /** Follows the state each frame: drone pitch, wind level, events, death. */
  update(state: SimState): void;
  /** Call on the user gesture that starts a run (browsers gate audio on it). */
  resume(): void;
  setMuted(muted: boolean): void;
  /** Current parameter values, for tests. */
  levels(): { enginePitch: number; wind: number; master: number };
}

const MASTER_GAIN = 0.8;
const ENGINE_GAIN = 0.25;
const ENGINE_BASE_HZ = 55;
const ENGINE_SPAN_HZ = 55;
const ENGINE_CUTOFF_LO = 200;
const ENGINE_CUTOFF_HI = 900;
const WIND_CENTRE_LO = 400;
const WIND_CENTRE_HI = 2500;
const WIND_GAIN = 0.6;
const SMOOTH_S = 0.08;
/** Blip pitch per event id (0 none, CLOSE, SO CLOSE, THREADED, GATE, DODGED). */
const BLIP_HZ = [0, 880, 1320, 880, 1320, 1760];

function speedFactor(state: SimState): number {
  const t = (state.speed - C.MIN_SPEED) / (C.MAX_SPEED - C.MIN_SPEED);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function createAudio(ctx: AudioContextLike): GameAudio {
  const master = ctx.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(ctx.destination);

  // Engine: two detuned sawtooths through a lowpass.
  const engineFilter = ctx.createBiquadFilter();
  engineFilter.type = 'lowpass';
  engineFilter.frequency.value = ENGINE_CUTOFF_LO;
  const engineGain = ctx.createGain();
  engineGain.gain.value = ENGINE_GAIN;
  const oscillators = [ctx.createOscillator(), ctx.createOscillator()];
  oscillators.forEach((o, i) => {
    o.type = 'sawtooth';
    o.frequency.value = ENGINE_BASE_HZ;
    o.detune.value = i === 0 ? -7 : 7;
    o.connect(engineFilter);
    o.start();
  });
  engineFilter.connect(engineGain);
  engineGain.connect(master);

  // Wind: looped white noise through a bandpass whose centre and gain follow speed.
  const noise = ctx.createBufferSource();
  const rate = 22050;
  const buffer = ctx.createBuffer(1, rate * 2, rate);
  const data = buffer.getChannelData(0);
  let x = 0x9e3779b9;
  for (let i = 0; i < data.length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    data[i] = ((x >>> 0) / 4294967296) * 2 - 1;
  }
  noise.buffer = buffer;
  noise.loop = true;
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.value = WIND_CENTRE_LO;
  windFilter.Q.value = 0.7;
  const windGain = ctx.createGain();
  windGain.gain.value = 0;
  noise.connect(windFilter);
  windFilter.connect(windGain);
  windGain.connect(master);
  noise.start();

  let muted = false;
  let lastEventTick = -1;
  let wasAlive = true;
  let enginePitch = ENGINE_BASE_HZ;
  let wind = 0;

  const tone = (hz: number, seconds: number, gain: number, type: OscillatorType): void => {
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.value = hz;
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    osc.connect(env);
    env.connect(master);
    osc.start(t0);
    osc.stop(t0 + seconds);
  };

  return {
    update(state) {
      const t = ctx.currentTime;
      const tV = speedFactor(state);
      enginePitch = ENGINE_BASE_HZ + ENGINE_SPAN_HZ * tV;
      wind = WIND_GAIN * tV * tV + 0.3 * state.proximity * tV;
      for (const o of oscillators) o.frequency.setTargetAtTime(enginePitch, t, SMOOTH_S);
      engineFilter.frequency.setTargetAtTime(
        ENGINE_CUTOFF_LO + (ENGINE_CUTOFF_HI - ENGINE_CUTOFF_LO) * tV,
        t,
        SMOOTH_S,
      );
      windFilter.frequency.setTargetAtTime(
        WIND_CENTRE_LO + (WIND_CENTRE_HI - WIND_CENTRE_LO) * tV,
        t,
        SMOOTH_S,
      );
      windGain.gain.setTargetAtTime(wind, t, SMOOTH_S);
      if (state.eventId !== 0 && state.eventTick !== lastEventTick) {
        lastEventTick = state.eventTick;
        tone(BLIP_HZ[state.eventId] ?? 880, 0.06, 0.3, 'sine');
      }
      if (state.alive === 0 && wasAlive) tone(60, 0.15, 0.6, 'sine');
      wasAlive = state.alive === 1;
    },
    resume() {
      if (ctx.state !== 'running') void ctx.resume();
    },
    setMuted(m) {
      muted = m;
      master.gain.setTargetAtTime(m ? 0 : MASTER_GAIN, ctx.currentTime, 0.02);
    },
    levels() {
      return { enginePitch, wind, master: muted ? 0 : MASTER_GAIN };
    },
  };
}
