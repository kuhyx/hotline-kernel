import { useEffect, useRef } from 'react';

export type Frame = (dtSeconds: number, nowMs: number) => void;

/**
 * requestAnimationFrame driver with a clamped delta, so a backgrounded tab does
 * not resume with one enormous step that teleports every enemy.
 *
 * The callback is kept in a ref that is synced in an effect rather than during
 * render, so the loop always sees the latest closure without re-subscribing.
 */
export const useGameLoop = (frame: Frame, maxStepSeconds = 0.05): void => {
  const frameRef = useRef<Frame>(frame);

  useEffect((): void => {
    frameRef.current = frame;
  }, [frame]);

  useEffect((): (() => void) => {
    let handle = 0;
    let last = 0;
    let started = false;
    const tick = (now: number): void => {
      // A timestamp of exactly 0 is a legitimate first frame, so the sentinel
      // has to be a separate flag rather than `last === 0`.
      const dt = started ? Math.min(maxStepSeconds, (now - last) / 1000) : 0;
      started = true;
      last = now;
      frameRef.current(dt, now);
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return (): void => { cancelAnimationFrame(handle); };
  }, [maxStepSeconds]);
};
