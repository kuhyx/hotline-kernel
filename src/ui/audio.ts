import type { Cue } from '../core/types.js';

export interface ToneSink {
  readonly play: (cue: Cue) => void;
}

interface AudioLike {
  readonly currentTime: number;
  readonly destination: unknown;
  readonly createOscillator: () => OscillatorNode;
  readonly createGain: () => GainNode;
  readonly createStereoPanner: () => StereoPannerNode;
}

const KIND_WAVE: Readonly<Record<Cue['kind'], OscillatorType>> = {
  commit: 'square', shot: 'sawtooth', kill: 'sine',
  death: 'sawtooth', dryFire: 'square', pickup: 'sine',
};

/** Audio is a channel, not a dependency: if it fails, the game still plays. */
export const makeToneSink = (context: AudioLike): ToneSink => ({
  play: (cue: Cue): void => {
    const osc = context.createOscillator();
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    const seconds = cue.durationMs / 1000;
    osc.type = KIND_WAVE[cue.kind];
    osc.frequency.value = cue.toneHz;
    panner.pan.value = Math.max(-1, Math.min(1, cue.pan));
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.14, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + seconds);
    osc.connect(gain);
    gain.connect(panner);
    panner.connect(context.destination as AudioNode);
    osc.start();
    osc.stop(context.currentTime + seconds + 0.02);
  },
});

export const silentSink = (): ToneSink => ({ play: (): void => undefined });
