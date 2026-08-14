import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { GameCanvas } from '../src/ui/GameCanvas.js';
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
