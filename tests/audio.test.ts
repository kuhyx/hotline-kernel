import { describe, expect, it, vi } from 'vitest';
import { makeToneSink, silentSink } from '../src/ui/audio.js';
import type { Cue } from '../src/core/types.js';

const cue = (over: Partial<Cue> = {}): Cue =>
  ({ toneHz: 440, pan: 0, durationMs: 100, kind: 'commit', gain: 0.14, ...over });

const fakeContext = () => {
  const frequency = { value: 0 };
  const gain = {
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  const pan = { value: 0 };
  const osc = {
    type: '' as OscillatorType, frequency,
    connect: vi.fn(), start: vi.fn(), stop: vi.fn(),
  };
  const gainNode = { gain, connect: vi.fn() };
  const panner = { pan, connect: vi.fn() };
  return {
    osc, gainNode, panner,
    ctx: {
      currentTime: 10,
      destination: {},
      createOscillator: (): never => osc as never,
      createGain: (): never => gainNode as never,
      createStereoPanner: (): never => panner as never,
    },
  };
};

describe('makeToneSink', () => {
  it('builds and starts a panned tone', () => {
    const f = fakeContext();
    makeToneSink(f.ctx).play(cue({ toneHz: 330, pan: -0.5 }));
    expect(f.osc.frequency.value).toBe(330);
    expect(f.panner.pan.value).toBe(-0.5);
    expect(f.osc.start).toHaveBeenCalledOnce();
    expect(f.osc.stop).toHaveBeenCalledWith(10.12);
  });
  it('clamps the pan into the stereo field', () => {
    const hard = fakeContext();
    makeToneSink(hard.ctx).play(cue({ pan: 9 }));
    expect(hard.panner.pan.value).toBe(1);
    const other = fakeContext();
    makeToneSink(other.ctx).play(cue({ pan: -9 }));
    expect(other.panner.pan.value).toBe(-1);
  });
  it('picks a waveform per cue kind', () => {
    const kinds: Cue['kind'][] = [
      'commit', 'shot', 'kill', 'death', 'dryFire', 'pickup', 'footstep',
    ];
    for (const kind of kinds) {
      const f = fakeContext();
      makeToneSink(f.ctx).play(cue({ kind }));
      expect(f.osc.type).not.toBe('');
    }
  });
  it('ramps to the cue gain, so a nearer footstep is louder', () => {
    const quiet = fakeContext();
    makeToneSink(quiet.ctx).play(cue({ gain: 0.06 }));
    expect(quiet.gainNode.gain.exponentialRampToValueAtTime)
      .toHaveBeenCalledWith(0.06, 10.01);
  });
  it('never ramps to zero, which the Web Audio API rejects', () => {
    const silent = fakeContext();
    makeToneSink(silent.ctx).play(cue({ gain: 0 }));
    expect(silent.gainNode.gain.exponentialRampToValueAtTime)
      .toHaveBeenCalledWith(0.0001, 10.01);
  });
  it('clamps a runaway gain to full scale', () => {
    const loud = fakeContext();
    makeToneSink(loud.ctx).play(cue({ gain: 9 }));
    expect(loud.gainNode.gain.exponentialRampToValueAtTime)
      .toHaveBeenCalledWith(1, 10.01);
  });
});

describe('silentSink', () => {
  it('accepts cues and does nothing', () => {
    const sink = silentSink();
    expect(() => { sink.play(cue()); }).not.toThrow();
  });
});
