import { act, render } from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameLoop } from '../src/ui/useGameLoop.js';
import { useKeyboard } from '../src/ui/useKeyboard.js';
import type { PlayerInput } from '../src/core/types.js';

afterEach(() => { vi.restoreAllMocks(); });

describe('useGameLoop', () => {
  const setupRaf = (): { run: (t: number) => void; cancelled: number[] } => {
    let cb: FrameRequestCallback | undefined;
    let id = 0;
    const cancelled: number[] = [];
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback): number => {
      cb = fn;
      id += 1;
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (handle: number): void => { cancelled.push(handle); });
    return { run: (t: number): void => { cb?.(t); }, cancelled };
  };

  it('passes a zero delta on the first frame, then real deltas', () => {
    const raf = setupRaf();
    const seen: number[] = [];
    const Probe = (): JSX.Element => {
      useGameLoop((dt) => { seen.push(dt); });
      return <div />;
    };
    render(<Probe />);
    act(() => { raf.run(0); });
    act(() => { raf.run(20); });
    expect(seen[0]).toBe(0);
    // 20ms sits under the 0.05s clamp, so it arrives unmodified.
    expect(seen[1]).toBeCloseTo(0.02);
  });

  it('clamps a huge delta from a backgrounded tab', () => {
    const raf = setupRaf();
    const seen: number[] = [];
    const Probe = (): JSX.Element => {
      useGameLoop((dt) => { seen.push(dt); }, 0.05);
      return <div />;
    };
    render(<Probe />);
    act(() => { raf.run(0); });
    act(() => { raf.run(60_000); });
    expect(seen[1]).toBe(0.05);
  });

  it('cancels the frame on unmount', () => {
    const raf = setupRaf();
    const Probe = (): JSX.Element => {
      useGameLoop(() => undefined);
      return <div />;
    };
    const view = render(<Probe />);
    view.unmount();
    expect(raf.cancelled.length).toBeGreaterThan(0);
  });

  it('always calls the newest callback', () => {
    const raf = setupRaf();
    const first = vi.fn();
    const second = vi.fn();
    const Probe = ({ fn }: { readonly fn: () => void }): JSX.Element => {
      useGameLoop(fn);
      return <div />;
    };
    const view = render(<Probe fn={first} />);
    view.rerender(<Probe fn={second} />);
    act(() => { raf.run(16); });
    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
  });
});

describe('useKeyboard', () => {
  const setup = (): { input: { current: PlayerInput }; actions: Record<string, ReturnType<typeof vi.fn>>; unmount: () => void } => {
    const actions = { onFire: vi.fn(), onMelee: vi.fn(), onLoot: vi.fn() };
    const holder: { input?: { current: PlayerInput } } = {};
    const Probe = (): JSX.Element => {
      holder.input = useKeyboard(actions);
      return <div />;
    };
    const view = render(<Probe />);
    if (holder.input === undefined) { throw new Error('hook did not run'); }
    return { input: holder.input, actions, unmount: (): void => { view.unmount(); } };
  };

  const press = (key: string): void => {
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true })); });
  };
  const release = (key: string): void => {
    act(() => { window.dispatchEvent(new KeyboardEvent('keyup', { key })); });
  };

  it('maps movement keys and clears them on release', () => {
    const s = setup();
    press('w');
    expect(s.input.current.forward).toBe(true);
    release('w');
    expect(s.input.current.forward).toBe(false);
  });

  it('is case insensitive and handles turn keys', () => {
    const s = setup();
    press('ArrowLeft');
    expect(s.input.current.turnLeft).toBe(true);
    press('D');
    expect(s.input.current.right).toBe(true);
  });

  it('fires the action keys', () => {
    const s = setup();
    press(' ');
    press('v');
    press('e');
    expect(s.actions['onFire']).toHaveBeenCalledOnce();
    expect(s.actions['onMelee']).toHaveBeenCalledOnce();
    expect(s.actions['onLoot']).toHaveBeenCalledOnce();
  });

  it('ignores keys it does not bind', () => {
    const s = setup();
    press('q');
    release('q');
    expect(s.input.current).toStrictEqual({
      forward: false, back: false, left: false, right: false,
      turnLeft: false, turnRight: false,
    });
  });

  it('detaches its listeners on unmount', () => {
    const s = setup();
    s.unmount();
    press('w');
    expect(s.input.current.forward).toBe(false);
  });
});
