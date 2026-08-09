import { type JSX, useEffect, useRef } from 'react';
import type { Ctx2D, Viewport } from '../render/raycaster.js';

export interface GameCanvasProps {
  readonly viewport: Viewport;
  readonly onContext: (ctx: Ctx2D | undefined) => void;
  readonly onLook: (deltaX: number) => void;
  readonly onFire: () => void;
  readonly onMelee: () => void;
}

/** Not every host grants pointer lock; sandboxed frames routinely refuse it. */
const tryPointerLock = (canvas: HTMLCanvasElement): void => {
  const request: unknown = Reflect.get(canvas, 'requestPointerLock');
  if (typeof request === 'function') {
    void canvas.requestPointerLock();
  }
};

export const GameCanvas = (props: GameCanvasProps): JSX.Element => {
  const { viewport, onContext, onLook, onFire, onMelee } = props;
  const ref = useRef<HTMLCanvasElement | null>(null);
  const ctxCb = useRef(onContext);
  const lookCb = useRef(onLook);
  const dragging = useRef(false);

  useEffect((): void => {
    ctxCb.current = onContext;
    lookCb.current = onLook;
  }, [onContext, onLook]);

  useEffect((): (() => void) => {
    const canvas = ref.current;
    ctxCb.current(canvas?.getContext('2d') ?? undefined);
    const move = (ev: MouseEvent): void => {
      if (document.pointerLockElement === canvas || dragging.current) {
        lookCb.current(ev.movementX);
      }
    };
    const up = (): void => { dragging.current = false; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return (): void => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      ctxCb.current(undefined);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      width={viewport.width}
      height={viewport.height}
      aria-label="Combat kernel viewport"
      onMouseDown={(ev): void => {
        const canvas = ref.current;
        if (canvas !== null && document.pointerLockElement !== canvas) {
          dragging.current = true;
          tryPointerLock(canvas);
          return;
        }
        if (ev.button === 2) { onMelee(); } else { onFire(); }
      }}
      onContextMenu={(ev): void => { ev.preventDefault(); }}
    />
  );
};
