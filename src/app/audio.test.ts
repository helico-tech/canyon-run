import { expect, test } from 'vitest';
import { createState } from '../sim/state.ts';
import { C } from '../sim/constants.ts';
import { createAudio } from './audio.ts';
import type { AudioContextLike } from './audio.ts';

/** A stub context that records parameter values instead of making sound. */
function stubContext(): AudioContextLike & { oscillators: number; resumed: number } {
  const param = (v: number) => ({
    value: v,
    setTargetAtTime(target: number) {
      this.value = target;
    },
    setValueAtTime(target: number) {
      this.value = target;
    },
    linearRampToValueAtTime(target: number) {
      this.value = target;
    },
    exponentialRampToValueAtTime(target: number) {
      this.value = target;
    },
  });
  const node = () => ({ connect: () => undefined, disconnect: () => undefined });
  const ctx = {
    oscillators: 0,
    resumed: 0,
    currentTime: 0,
    state: 'suspended' as AudioContextState,
    destination: node(),
    createGain: () => ({ ...node(), gain: param(1) }),
    createOscillator() {
      ctx.oscillators++;
      return {
        ...node(),
        type: 'sine' as OscillatorType,
        frequency: param(440),
        detune: param(0),
        start: () => undefined,
        stop: () => undefined,
      };
    },
    createBiquadFilter: () => ({
      ...node(),
      type: 'lowpass' as BiquadFilterType,
      frequency: param(350),
      Q: param(1),
    }),
    createBuffer: (_c: number, length: number, rate: number) => ({
      length,
      sampleRate: rate,
      getChannelData: () => new Float32Array(length),
    }),
    createBufferSource: () => ({
      ...node(),
      buffer: null as AudioBuffer | null,
      loop: false,
      start: () => undefined,
      stop: () => undefined,
    }),
    resume() {
      ctx.resumed++;
      ctx.state = 'running';
      return Promise.resolve();
    },
  };
  return ctx as unknown as AudioContextLike & { oscillators: number; resumed: number };
}

test('engine pitch and wind level rise with speed; muting silences the master', () => {
  const ctx = stubContext();
  const audio = createAudio(ctx);
  const s = createState(1, 0);
  s.speed = C.MIN_SPEED;
  audio.update(s);
  const slowPitch = audio.levels().enginePitch;
  const slowWind = audio.levels().wind;
  s.speed = C.MAX_SPEED;
  audio.update(s);
  expect(audio.levels().enginePitch).toBeGreaterThan(slowPitch);
  expect(audio.levels().wind).toBeGreaterThan(slowWind);
  audio.setMuted(true);
  expect(audio.levels().master).toBe(0);
  audio.setMuted(false);
  expect(audio.levels().master).toBeGreaterThan(0);
});

test('one blip per score event, resumed on demand, a thud on death', () => {
  const ctx = stubContext();
  const audio = createAudio(ctx);
  const s = createState(1, 0);
  const base = ctx.oscillators;
  s.eventId = 1;
  s.eventTick = 10;
  audio.update(s);
  audio.update(s);
  expect(ctx.oscillators).toBe(base + 1);
  s.eventId = 4;
  s.eventTick = 40;
  audio.update(s);
  expect(ctx.oscillators).toBe(base + 2);
  audio.resume();
  expect(ctx.resumed).toBe(1);
  s.alive = 0;
  audio.update(s);
  audio.update(s);
  expect(ctx.oscillators).toBe(base + 3);
});
