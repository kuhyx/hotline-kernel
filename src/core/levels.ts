import type { ArchetypeId } from './types.js';

export interface Spawn {
  readonly x: number;
  readonly y: number;
  readonly archetype: ArchetypeId;
}

export interface Level {
  readonly grid: readonly string[];
  readonly px: number;
  readonly py: number;
  readonly pa: number;
  readonly spawns: readonly Spawn[];
}

const s = (x: number, y: number, archetype: ArchetypeId): Spawn => ({ x, y, archetype });

/**
 * Open-plan only. Pillars and stubs, never a corridor: the tight-corner
 * geometry is what turns a first-person one-hit-kill game into a coin flip.
 * Spawns sit inside earshot so there is no dead space to walk through.
 */
export const LEVELS: readonly Level[] = [
  {
    grid: [
      '################',
      '#..............#',
      '#..###......##.#',
      '#..............#',
      '#....##...##...#',
      '#..............#',
      '#..............#',
      '#...##....##...#',
      '#..............#',
      '#.##.......###.#',
      '#..............#',
      '################',
    ],
    px: 2.5, py: 6.5, pa: 0,
    spawns: [s(9.5, 3.5, 'grunt'), s(12.5, 8.5, 'grunt'), s(7.5, 9.5, 'rusher')],
  },
  {
    grid: [
      '##################',
      '#................#',
      '#..##........##..#',
      '#................#',
      '#.......##.......#',
      '#.......##.......#',
      '#................#',
      '#.......##.......#',
      '#.......##.......#',
      '#................#',
      '#..##........##..#',
      '#................#',
      '##################',
    ],
    px: 2.5, py: 6.5, pa: 0,
    spawns: [
      s(14.5, 3.5, 'rifleman'), s(14.5, 10.5, 'grunt'),
      s(9.5, 2.5, 'shotgunner'), s(6.5, 10.5, 'rusher'),
    ],
  },
  {
    grid: [
      '####################',
      '#..................#',
      '#..####......####..#',
      '#..................#',
      '#........##........#',
      '#........##........#',
      '#..................#',
      '#..................#',
      '#........##........#',
      '#........##........#',
      '#..................#',
      '#..####......####..#',
      '#..................#',
      '####################',
    ],
    px: 3.5, py: 7.5, pa: 0,
    spawns: [
      s(16.5, 3.5, 'rifleman'), s(16.5, 11.5, 'rifleman'),
      s(11.5, 7.5, 'shotgunner'), s(6.5, 3.5, 'hound'), s(6.5, 11.5, 'rusher'),
    ],
  },
  {
    grid: [
      '#################',
      '#...............#',
      '#.##.........##.#',
      '#...............#',
      '#.......#.......#',
      '#......###......#',
      '#.......#.......#',
      '#...............#',
      '#.##.........##.#',
      '#...............#',
      '#...............#',
      '#################',
    ],
    px: 8.5, py: 6.5, pa: 0,
    spawns: [
      s(2.5, 2.5, 'grunt'), s(14.5, 2.5, 'grunt'), s(2.5, 10.5, 'rusher'),
      s(14.5, 10.5, 'rusher'), s(8.5, 2.5, 'shotgunner'),
    ],
  },
];

export const levelAt = (index: number): Level => {
  const wrapped = ((index % LEVELS.length) + LEVELS.length) % LEVELS.length;
  const level = LEVELS[wrapped];
  if (level === undefined) {
    throw new Error(`no level at index ${String(index)}`);
  }
  return level;
};
