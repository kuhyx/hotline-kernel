import { heldBy, windupProgress } from '../core/tokens.js';
import type { FairnessLog, GameState } from '../core/types.js';

/**
 * The simulation is deliberately mutable — it runs every frame and allocating
 * a fresh world per tick would be wasteful. React's model is the opposite, so
 * the two meet here: the sim stays behind a ref, and each frame publishes this
 * small immutable snapshot for the rig to render from.
 */
export interface SlotView {
  readonly label: string;
  readonly colour: string;
  readonly progress: number;
}

export interface RigView {
  readonly levelIndex: number;
  readonly combo: number;
  readonly score: number;
  readonly bestCombo: number;
  readonly log: FairnessLog;
  readonly ranged: readonly SlotView[];
  readonly melee: readonly SlotView[];
}

const slots = (state: GameState, melee: boolean, now: number): SlotView[] =>
  heldBy(state, melee).map((enemy): SlotView => ({
    label: enemy.archetype.label,
    colour: enemy.archetype.colour,
    progress: windupProgress(enemy, now),
  }));

export const buildRigView = (state: GameState, now: number): RigView => ({
  levelIndex: state.levelIndex,
  combo: state.combo,
  score: state.score,
  bestCombo: state.bestCombo,
  log: { ...state.log, survivalMs: [...state.log.survivalMs] },
  ranged: slots(state, false, now),
  melee: slots(state, true, now),
});
