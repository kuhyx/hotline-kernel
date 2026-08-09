import type { Archetype, ArchetypeId } from './types.js';

/**
 * Wind-ups start deliberately generous. You have to feel "too fair" to know
 * which direction you are tuning and when you have overshot.
 *
 * `range` doubles as the tell radius. Splitting them would let an enemy shoot
 * from somewhere it cannot announce itself, which is the exact failure the
 * hybrid line-of-sight rule exists to prevent.
 */
export const ARCHETYPES: Readonly<Record<ArchetypeId, Archetype>> = {
  grunt: {
    id: 'grunt', label: 'pistol grunt', windupMs: 1000, range: 14,
    projectileSpeed: 9, moveSpeed: 1.8, melee: false, magazine: 6,
    toneHz: 330, colour: '#ff2d6f', drops: 'pistol',
  },
  shotgunner: {
    id: 'shotgunner', label: 'shotgunner', windupMs: 1200, range: 9,
    projectileSpeed: 11, moveSpeed: 2.2, melee: false, magazine: 2,
    toneHz: 196, colour: '#ff7a3d', drops: 'shotgun',
  },
  rifleman: {
    id: 'rifleman', label: 'rifleman', windupMs: 1400, range: 26,
    projectileSpeed: 14, moveSpeed: 1.4, melee: false, magazine: 4,
    toneHz: 494, colour: '#ffb020', drops: 'rifle',
  },
  rusher: {
    id: 'rusher', label: 'melee rusher', windupMs: 500, range: 1.3,
    projectileSpeed: 0, moveSpeed: 3.2, melee: true, magazine: 0,
    toneHz: 147, colour: '#21e6c1', drops: 'fists',
  },
  hound: {
    id: 'hound', label: 'fast melee', windupMs: 350, range: 1.1,
    projectileSpeed: 0, moveSpeed: 4.3, melee: true, magazine: 0,
    toneHz: 110, colour: '#7ce8ff', drops: 'fists',
  },
};
