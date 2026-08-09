import { ARCHETYPES } from '../src/core/archetypes.js';
import { defaultConfig } from '../src/core/config.js';
import { createState } from '../src/core/sim.js';
import type {
  Archetype, ArchetypeId, Config, Enemy, GameState,
} from '../src/core/types.js';
import type { Ctx2D } from '../src/render/raycaster.js';

export const cfg = (over: Partial<Config> = {}): Config => ({ ...defaultConfig(), ...over });

/** A featureless 12x12 room. No occlusion unless a test asks for it. */
export const openGrid = (): string[] => [
  '############', '#..........#', '#..........#', '#..........#',
  '#..........#', '#..........#', '#..........#', '#..........#',
  '#..........#', '#..........#', '#..........#', '############',
];

export const enemyAt = (
  x: number, y: number, id: ArchetypeId = 'grunt', over: Partial<Enemy> = {},
): Enemy => ({
  x, y, archetype: ARCHETYPES[id], alive: true, alerted: true, committing: false,
  grantedAt: 0, deadline: 0, baseWindup: 0, seenAtCommit: false,
  heardAtCommit: false, lastKnownX: x, lastKnownY: y, looted: false, ...over,
});

/**
 * A live bystander. Without at least one living enemy the room counts as clear
 * and the simulation advances to the next micro-level mid-test.
 */
export const guard = (): Enemy => enemyAt(9.5, 9.5, 'grunt', { alerted: false });

/** Caps at zero: nobody may commit, so a test can isolate one behaviour. */
export const noCommit = (over: Partial<Config> = {}): Config =>
  cfg({ rangedTokens: 0, meleeTokens: 0, ...over });

export const stateWith = (enemies: Enemy[], over: Partial<GameState> = {}): GameState => {
  const s = createState(0);
  s.grid = openGrid();
  s.px = 5.5;
  s.py = 5.5;
  s.pa = 0;
  s.enemies = enemies;
  s.projectiles = [];
  s.cues = [];
  return Object.assign(s, over);
};

export interface RecordingCtx extends Ctx2D {
  readonly calls: string[];
}

export const recordingCtx = (): RecordingCtx => {
  const calls: string[] = [];
  const rec = (name: string) => (...args: unknown[]): void => {
    calls.push(`${name}(${args.map((a) => String(a)).join(',')})`);
  };
  return {
    calls,
    fillStyle: '', strokeStyle: '', lineWidth: 0, globalAlpha: 1, font: '',
    fillRect: rec('fillRect'), fillText: rec('fillText'), beginPath: rec('beginPath'),
    arc: rec('arc'), fill: rec('fill'), moveTo: rec('moveTo'),
    lineTo: rec('lineTo'), stroke: rec('stroke'),
  };
};

export const mutableArchetype = (base: Archetype, over: Partial<Archetype>): Archetype =>
  ({ ...base, ...over });
