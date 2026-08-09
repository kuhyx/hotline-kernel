import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { firePlayerWeapon, lootWeapon, meleePlayer } from './core/combat.js';
import { defaultConfig } from './core/config.js';
import { makeRng } from './core/rng.js';
import { createState, step } from './core/sim.js';
import type { Config, GameState } from './core/types.js';
import { type Ctx2D, renderFrame } from './render/raycaster.js';
import { GameCanvas } from './ui/GameCanvas.js';
import { Rig } from './ui/Rig.js';
import { type ToneSink, silentSink } from './ui/audio.js';
import { type RigView, buildRigView } from './ui/rigView.js';
import { useGameLoop } from './ui/useGameLoop.js';
import { useKeyboard } from './ui/useKeyboard.js';

const VIEWPORT = { width: 880, height: 520 } as const;
const LOOK_SENSITIVITY = 0.0035;

export interface AppProps {
  readonly sink?: ToneSink;
  readonly seed?: number;
}

export const App = ({ sink, seed }: AppProps = {}): JSX.Element => {
  const tone = useMemo((): ToneSink => sink ?? silentSink(), [sink]);
  const rng = useMemo(() => makeRng(seed ?? 1337), [seed]);
  const zbuf = useMemo(() => new Float32Array(VIEWPORT.width), []);

  // The world is mutable and lives behind a ref; it is never read during
  // render. Each frame publishes an immutable snapshot for the rig instead.
  const world = useRef<GameState>(createState(0));
  const ctxRef = useRef<Ctx2D | undefined>(undefined);

  const [config, setConfig] = useState<Config>(defaultConfig);
  const [view, setView] = useState<RigView>(() => buildRigView(createState(0), 0));
  const cfgRef = useRef<Config>(config);
  useEffect((): void => { cfgRef.current = config; }, [config]);

  const onFire = useCallback((): void => {
    firePlayerWeapon(world.current, performance.now(), cfgRef.current, rng);
  }, [rng]);
  const onMelee = useCallback((): void => {
    meleePlayer(world.current, performance.now(), cfgRef.current, rng);
  }, [rng]);
  const onLoot = useCallback((): void => { lootWeapon(world.current); }, []);
  const onLook = useCallback((dx: number): void => {
    world.current.pa += dx * LOOK_SENSITIVITY;
  }, []);
  const onContext = useCallback((ctx: Ctx2D | undefined): void => { ctxRef.current = ctx; }, []);

  const actions = useMemo(() => ({ onFire, onMelee, onLoot }), [onFire, onMelee, onLoot]);
  const input = useKeyboard(actions);

  // Deliberately not memoized: useGameLoop syncs the callback into a ref every
  // render, so a fresh identity costs one assignment and keeps the closure current.
  const frame = (dt: number, nowMs: number): void => {
    const state = world.current;
    const cfg = cfgRef.current;
    step(state, input.current, dt, nowMs, cfg, rng);
    for (const cue of state.cues) { tone.play(cue); }
    state.cues.length = 0;
    const ctx = ctxRef.current;
    if (ctx !== undefined) {
      renderFrame(ctx, state, VIEWPORT, cfg, zbuf, nowMs);
    }
    setView(buildRigView(state, nowMs));
  };

  useGameLoop(frame);

  const onConfig = useCallback(<K extends keyof Config>(key: K, value: Config[K]): void => {
    setConfig((prev): Config => ({ ...prev, [key]: value }));
  }, []);

  const onReset = useCallback((): void => {
    const fresh = createState(performance.now());
    world.current = fresh;
    setConfig(defaultConfig);
    setView(buildRigView(fresh, performance.now()));
  }, []);

  return (
    <div id="app">
      <div id="stage">
        <GameCanvas
          viewport={VIEWPORT}
          onContext={onContext}
          onLook={onLook}
          onFire={onFire}
          onMelee={onMelee}
        />
      </div>
      <Rig view={view} config={config} onConfig={onConfig} onReset={onReset} />
    </div>
  );
};
