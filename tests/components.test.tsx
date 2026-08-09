import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { defaultConfig } from '../src/core/config.js';
import { createState, loadLevel } from '../src/core/sim.js';
import { buildRigView } from '../src/ui/rigView.js';
import { GameCanvas } from '../src/ui/GameCanvas.js';
import { Rig } from '../src/ui/Rig.js';
import type { Config, GameState } from '../src/core/types.js';
import { recordingCtx } from './helpers.js';

const setPointerLock = (el: Element | null): void => {
  Object.defineProperty(document, 'pointerLockElement', {
    configurable: true, get: () => el,
  });
};

afterEach(() => {
  vi.restoreAllMocks();
  setPointerLock(null);
});

describe('Rig', () => {
  const renderRig = (state: GameState, config: Config = defaultConfig()) => {
    const onConfig = vi.fn();
    const onReset = vi.fn();
    render(
      <Rig view={buildRigView(state, 500)} config={config}
        onConfig={onConfig} onReset={onReset} />,
    );
    return { onConfig, onReset };
  };

  it('shows empty token slots on a fresh run', () => {
    renderRig(createState(0));
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('shows the holder in a token slot', () => {
    const state = createState(0);
    const first = state.enemies[0]!;
    first.committing = true;
    first.grantedAt = 0;
    first.deadline = 1000;
    renderRig(state);
    expect(screen.getAllByText(first.archetype.label).length).toBeGreaterThan(0);
  });

  it('renders a third ranged slot when the scaled cap grants one', () => {
    // Level 1 is the first with three ranged spawns; level 0 has only two.
    const state = createState(0);
    loadLevel(state, 1, 0, 'fists', 0);
    const ranged = state.enemies.filter((e) => !e.archetype.melee).slice(0, 3);
    expect(ranged).toHaveLength(3);
    for (const [i, e] of ranged.entries()) {
      e.committing = true;
      e.grantedAt = 0;
      e.deadline = 1000 + i;
    }
    renderRig(state);
    // Hardcoded RANGED 1/2 rows would drop the third holder silently.
    expect(screen.getByText('RANGED 3')).toBeTruthy();
  });

  it('reports no deaths yet', () => {
    renderRig(createState(0));
    expect(screen.getByText(/must stay at zero/)).toBeTruthy();
    expect(screen.getByText('—', { selector: 'td.n' })).toBeTruthy();
  });

  it('reports the gate holding once deaths exist but none were unannounced', () => {
    const state = createState(0);
    state.log = { deaths: 3, seenAtCommit: 3, heardAtCommit: 1, unannounced: 0, survivalMs: [1000, 3000] };
    renderRig(state);
    expect(screen.getByText(/Gate holding/)).toBeTruthy();
    expect(screen.getByText('3.0s')).toBeTruthy();
  });

  it('flags a leaking gate', () => {
    const state = createState(0);
    state.log = { deaths: 2, seenAtCommit: 1, heardAtCommit: 0, unannounced: 1, survivalMs: [500] };
    renderRig(state);
    expect(screen.getByText(/Fix the gate before touching wind-up/)).toBeTruthy();
  });

  it('reports a numeric config change', () => {
    const { onConfig } = renderRig(createState(0));
    fireEvent.change(screen.getByLabelText('ranged token cap'), { target: { value: '3' } });
    expect(onConfig).toHaveBeenCalledWith('rangedTokens', 3);
  });

  it('reports a priority change', () => {
    const { onConfig } = renderRig(createState(0));
    fireEvent.change(screen.getByLabelText('priority'), { target: { value: 'nearest' } });
    expect(onConfig).toHaveBeenCalledWith('priority', 'nearest');
  });

  it('reports an inherit-rule change', () => {
    const { onConfig } = renderRig(createState(0));
    fireEvent.change(screen.getByLabelText('on kill, next holder'), { target: { value: 'inheritRemaining' } });
    expect(onConfig).toHaveBeenCalledWith('inherit', 'inheritRemaining');
  });

  it('reports a toggled information channel', () => {
    const { onConfig } = renderRig(createState(0));
    fireEvent.click(screen.getByLabelText('through-wall silhouettes'));
    expect(onConfig).toHaveBeenCalledWith('silhouettes', false);
  });

  it('reports a wind-up change per archetype', () => {
    const { onConfig } = renderRig(createState(0));
    fireEvent.change(screen.getByLabelText('rifleman'), { target: { value: '900' } });
    expect(onConfig).toHaveBeenCalledWith('windupMs', expect.objectContaining({ rifleman: 900 }));
  });

  it('formats the out-of-view bonus and the derived player values', () => {
    renderRig(createState(0));
    expect(screen.getByText('+400ms')).toBeTruthy();
    expect(screen.getByText('4.2')).toBeTruthy();
    expect(screen.getByText('100°')).toBeTruthy();
  });

  it('resets on demand', () => {
    const { onReset } = renderRig(createState(0));
    fireEvent.click(screen.getByRole('button', { name: /Reset log and run/ }));
    expect(onReset).toHaveBeenCalledOnce();
  });
});

describe('GameCanvas', () => {
  const setup = () => {
    const props = {
      viewport: { width: 32, height: 24 },
      onContext: vi.fn(),
      onLook: vi.fn(),
      onFire: vi.fn(),
      onMelee: vi.fn(),
    };
    const view = render(<GameCanvas {...props} />);
    return { props, view, canvas: screen.getByLabelText('Combat kernel viewport') };
  };

  it('hands the 2D context up on mount and clears it on unmount', () => {
    const ctx = recordingCtx();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
    const s = setup();
    expect(s.props.onContext).toHaveBeenCalledWith(ctx);
    s.view.unmount();
    expect(s.props.onContext).toHaveBeenLastCalledWith(undefined);
  });

  it('reports undefined when the browser gives no 2D context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const s = setup();
    expect(s.props.onContext).toHaveBeenCalledWith(undefined);
  });

  it('requests pointer lock on the first click instead of firing', () => {
    const requestPointerLock = vi.fn();
    Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', {
      configurable: true, writable: true, value: requestPointerLock,
    });
    const s = setup();
    fireEvent.mouseDown(s.canvas, { button: 0 });
    expect(requestPointerLock).toHaveBeenCalled();
    expect(s.props.onFire).not.toHaveBeenCalled();
  });

  it('fires and melees once the pointer is locked', () => {
    const s = setup();
    setPointerLock(s.canvas);
    fireEvent.mouseDown(s.canvas, { button: 0 });
    expect(s.props.onFire).toHaveBeenCalledOnce();
    fireEvent.mouseDown(s.canvas, { button: 2 });
    expect(s.props.onMelee).toHaveBeenCalledOnce();
  });

  it('looks while the pointer is locked', () => {
    const s = setup();
    setPointerLock(s.canvas);
    fireEvent.mouseMove(window, { movementX: 12 });
    expect(s.props.onLook).toHaveBeenCalledWith(12);
  });

  it('falls back to drag-to-look when pointer lock is unavailable', () => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', {
      configurable: true, writable: true, value: undefined,
    });
    const s = setup();
    fireEvent.mouseDown(s.canvas, { button: 0 });
    fireEvent.mouseMove(window, { movementX: 7 });
    expect(s.props.onLook).toHaveBeenCalledWith(7);
    fireEvent.mouseUp(window);
    s.props.onLook.mockClear();
    fireEvent.mouseMove(window, { movementX: 7 });
    expect(s.props.onLook).not.toHaveBeenCalled();
  });

  it('suppresses the context menu so right-click can melee', () => {
    const s = setup();
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    s.canvas.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});

describe('App', () => {
  let frame: FrameRequestCallback | undefined;

  beforeEach(() => {
    frame = undefined;
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback): number => {
      frame = fn;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', (): void => undefined);
  });

  const tick = (t: number): void => { act(() => { frame?.(t); }); };

  it('renders, steps and draws when a context is available', () => {
    const ctx = recordingCtx();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
    render(<App seed={7} />);
    tick(16);
    tick(32);
    expect(ctx.calls.length).toBeGreaterThan(0);
  });

  it('keeps stepping when no drawing context exists', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    render(<App />);
    tick(16);
    expect(screen.getByText('Combat kernel')).toBeTruthy();
  });

  it('drains cues into the supplied sink', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(recordingCtx() as never);
    const play = vi.fn();
    render(<App sink={{ play }} seed={4} />);
    // Level one's pillars block every sightline to the spawn point, so a
    // stationary player never alerts anyone. Walk into the room.
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', cancelable: true }));
    });
    for (let i = 1; i < 600; i += 1) { tick(i * 33); }
    expect(play).toHaveBeenCalled();
  });

  it('applies a config change from the rig', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(recordingCtx() as never);
    render(<App />);
    tick(16);
    fireEvent.change(screen.getByLabelText('ranged token cap'), { target: { value: '4' } });
    expect(screen.getByLabelText<HTMLInputElement>('ranged token cap').value).toBe('4');
  });

  it('applies a wind-up change to living enemies of that archetype', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(recordingCtx() as never);
    render(<App />);
    tick(16);
    fireEvent.change(screen.getByLabelText('pistol grunt'), { target: { value: '250' } });
    expect(screen.getByLabelText<HTMLInputElement>('pistol grunt').value).toBe('250');
  });

  it('resets the run', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(recordingCtx() as never);
    render(<App />);
    for (let i = 1; i < 120; i += 1) { tick(i * 33); }
    fireEvent.click(screen.getByRole('button', { name: /Reset log and run/ }));
    tick(9000);
    expect(screen.getByText('Combat kernel')).toBeTruthy();
  });

  it('drives fire, melee and loot from the keyboard', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(recordingCtx() as never);
    render(<App seed={2} />);
    tick(16);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', cancelable: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }));
    });
    tick(48);
    expect(screen.getByText('Combat kernel')).toBeTruthy();
  });

  it('looks via the canvas', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(recordingCtx() as never);
    render(<App />);
    const canvas = screen.getByLabelText('Combat kernel viewport');
    setPointerLock(canvas);
    fireEvent.mouseMove(window, { movementX: 25 });
    fireEvent.mouseDown(canvas, { button: 0 });
    fireEvent.mouseDown(canvas, { button: 2 });
    tick(16);
    expect(screen.getByText('Combat kernel')).toBeTruthy();
  });
});

describe('Rig exhaustively', () => {
  const RANGES: readonly [string, string][] = [
    ['ranged token cap', '3'],
    ['melee token cap', '2'],
    ['tokens per living enemy', '0.5'],
    ['grant stagger', '300'],
    ['pistol grunt', '800'],
    ['shotgunner', '900'],
    ['rifleman', '1100'],
    ['melee rusher', '400'],
    ['fast melee', '300'],
    ['+ out of FOV', '600'],
    ['move speed', '5.5'],
    ['field of view', '110'],
    ['combo idle break', '2000'],
  ];
  const TOGGLES = [
    'through-wall silhouettes', 'peripheral threat arcs', 'audio commit tells',
  ] as const;

  it('reports every slider and every toggle', () => {
    const onConfig = vi.fn();
    render(
      <Rig view={buildRigView(createState(0), 0)} config={defaultConfig()}
        onConfig={onConfig} onReset={vi.fn()} />,
    );
    for (const [label, value] of RANGES) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    for (const label of TOGGLES) {
      fireEvent.click(screen.getByLabelText(label));
    }
    expect(onConfig.mock.calls.map(([key]) => key as string)).toStrictEqual([
      'rangedTokens', 'meleeTokens', 'tokensPerLiving', 'grantStaggerMs',
      'windupMs', 'windupMs', 'windupMs', 'windupMs', 'windupMs',
      'outOfFovBonusMs', 'playerSpeed', 'fovDegrees', 'comboBreakMs',
      'silhouettes', 'threatArcs', 'audioTells',
    ]);
  });

  it('renders every value formatter', () => {
    render(
      <Rig view={buildRigView(createState(0), 0)} config={defaultConfig()}
        onConfig={vi.fn()} onReset={vi.fn()} />,
    );
    expect(screen.getByText('1400ms')).toBeTruthy();
    expect(screen.getByText('+400ms')).toBeTruthy();
    expect(screen.getByText('4.2')).toBeTruthy();
    expect(screen.getByText('100°')).toBeTruthy();
    expect(screen.getByText('3000ms')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });
});
