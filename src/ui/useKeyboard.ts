import { useEffect, useRef } from 'react';
import { type PlayerInput, emptyInput } from '../core/types.js';

const BINDINGS: Readonly<Record<string, keyof PlayerInput>> = {
  w: 'forward', s: 'back', a: 'left', d: 'right',
  arrowleft: 'turnLeft', arrowright: 'turnRight',
};

export interface Actions {
  readonly onFire: () => void;
  readonly onMelee: () => void;
  readonly onLoot: () => void;
}

export const useKeyboard = (actions: Actions): { current: PlayerInput } => {
  const input = useRef<PlayerInput>(emptyInput());
  const actionsRef = useRef<Actions>(actions);

  useEffect((): void => {
    actionsRef.current = actions;
  }, [actions]);

  useEffect((): (() => void) => {
    const down = (ev: KeyboardEvent): void => {
      const key = ev.key.toLowerCase();
      const bound = BINDINGS[key];
      if (bound !== undefined) {
        input.current[bound] = true;
        ev.preventDefault();
      }
      if (key === ' ') { ev.preventDefault(); actionsRef.current.onFire(); }
      if (key === 'v') { actionsRef.current.onMelee(); }
      if (key === 'e') { actionsRef.current.onLoot(); }
    };
    const up = (ev: KeyboardEvent): void => {
      const bound = BINDINGS[ev.key.toLowerCase()];
      if (bound !== undefined) { input.current[bound] = false; }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return (): void => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  return input;
};
