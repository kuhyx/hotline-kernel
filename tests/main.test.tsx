import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const render = vi.fn();
  const createRoot = vi.fn(() => ({ render, unmount: vi.fn() }));
  return { render, createRoot };
});

vi.mock('react-dom/client', () => ({ createRoot: hoisted.createRoot }));

const stubAudioContext = (): unknown => ({
  currentTime: 0,
  destination: {},
  createOscillator: (): unknown => ({
    type: '', frequency: { value: 0 },
    connect: (): void => undefined, start: (): void => undefined, stop: (): void => undefined,
  }),
  createGain: (): unknown => ({
    gain: {
      setValueAtTime: (): void => undefined,
      exponentialRampToValueAtTime: (): void => undefined,
    },
    connect: (): void => undefined,
  }),
  createStereoPanner: (): unknown => ({
    pan: { value: 0 }, connect: (): void => undefined,
  }),
});

/** AudioContext is constructed with `new`, so the stub has to be constructible. */
const StubAudioContext = class {
  public readonly isStub = true;

  public constructor() {
    Object.assign(this, stubAudioContext());
  }
};

beforeEach(() => {
  vi.resetModules();
  hoisted.render.mockClear();
  hoisted.createRoot.mockClear();
  vi.stubGlobal('AudioContext', StubAudioContext);
  vi.stubGlobal('requestAnimationFrame', (): number => 1);
  vi.stubGlobal('cancelAnimationFrame', (): void => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('entry point', () => {
  it('mounts into #root when the host page provides it', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    await import('../src/main.js');
    expect(hoisted.createRoot).toHaveBeenCalledOnce();
    expect(hoisted.render).toHaveBeenCalledOnce();
  });

  it('does nothing when there is no mount point', async () => {
    document.body.innerHTML = '<div id="somewhere-else"></div>';
    await import('../src/main.js');
    expect(hoisted.createRoot).not.toHaveBeenCalled();
  });

  it('exposes mount for embedding in another page', async () => {
    document.body.innerHTML = '<div id="host"></div>';
    const mod = await import('../src/main.js');
    const host = document.querySelector<HTMLElement>('#host');
    if (host === null) { throw new Error('fixture missing'); }
    mod.mount(host);
    expect(hoisted.createRoot).toHaveBeenCalledWith(host);
  });
});
