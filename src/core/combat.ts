import { ARCHETYPES } from './archetypes.js';
import { clearRay, distanceToPlayer, normaliseAngle } from './geometry.js';
import type { Rng } from './rng.js';
import { serviceTokens } from './tokens.js';
import type { Config, Enemy, GameState, WeaponId } from './types.js';

const SPREAD: Readonly<Record<WeaponId, number>> = {
  fists: 0, pistol: 0.03, shotgun: 0.1, rifle: 0.012,
};
const PELLETS: Readonly<Record<WeaponId, number>> = {
  fists: 0, pistol: 1, shotgun: 5, rifle: 1,
};
const MAGAZINE: Readonly<Record<WeaponId, number>> = {
  fists: 0, pistol: ARCHETYPES.grunt.magazine,
  shotgun: ARCHETYPES.shotgunner.magazine, rifle: ARCHETYPES.rifleman.magazine,
};

export const magazineFor = (weapon: WeaponId): number => MAGAZINE[weapon];

/** Gunfire draws the room. Melee does not: that is the whole trade. */
export const alertWithin = (state: GameState, radius: number): void => {
  for (const e of state.enemies) {
    if (e.alive && distanceToPlayer(state, e) < radius) {
      e.alerted = true;
    }
  }
};

export const killEnemy = (
  state: GameState, enemy: Enemy, now: number, cfg: Config, rng: Rng,
): void => {
  const freed = enemy.committing ? Math.max(0, enemy.deadline - now) : undefined;
  enemy.alive = false;
  enemy.committing = false; // death frees the token
  state.combo += 1;
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  state.score += 100 * state.combo;
  state.lastKillAt = now;
  state.cues.push({ toneHz: 880, pan: 0, durationMs: 50, kind: 'kill', gain: 0.14 });
  serviceTokens(state, now, cfg, rng, freed);
};

export const killPlayer = (
  state: GameState, seen: boolean, heard: boolean, now: number,
): void => {
  if (state.dead) {
    return;
  }
  state.dead = true;
  state.diedAt = now;
  state.log.deaths += 1;
  if (seen) {
    state.log.seenAtCommit += 1;
  }
  if (heard) {
    state.log.heardAtCommit += 1;
  }
  if (!seen && !heard) {
    state.log.unannounced += 1;
  }
  state.log.survivalMs.push(now - state.levelStartedAt);
  state.combo = 0;
  state.cues.push({ toneHz: 70, pan: 0, durationMs: 400, kind: 'death', gain: 0.14 });
};

const aimHits = (state: GameState, enemy: Enemy, angle: number): boolean => {
  const distance = distanceToPlayer(state, enemy);
  const bearing = normaliseAngle(
    Math.atan2(enemy.y - state.py, enemy.x - state.px) - angle,
  );
  return Math.abs(bearing) < Math.atan2(0.34, distance) &&
    clearRay(state.grid, state.px, state.py, enemy.x, enemy.y);
};

const nearestHit = (state: GameState, angle: number): Enemy | undefined => {
  const hits = state.enemies.filter((e) => e.alive && aimHits(state, e, angle));
  if (hits.length === 0) {
    return undefined;
  }
  return hits.reduce((best, e) =>
    distanceToPlayer(state, e) < distanceToPlayer(state, best) ? e : best);
};

/**
 * Player is hitscan. Spread widening with distance is legitimate on this side
 * only: a random miss costs tempo and the player still knows what happened,
 * whereas a random enemy hit is an unattributable death.
 */
export const firePlayerWeapon = (
  state: GameState, now: number, cfg: Config, rng: Rng,
): void => {
  if (state.dead || state.weapon === 'fists') {
    return;
  }
  if (state.ammo <= 0) {
    state.cues.push({ toneHz: 140, pan: 0, durationMs: 40, kind: 'dryFire', gain: 0.14 });
    return;
  }
  state.ammo -= 1;
  state.cues.push({ toneHz: 200, pan: 0, durationMs: 50, kind: 'shot', gain: 0.14 });
  alertWithin(state, 22);
  const spread = SPREAD[state.weapon];
  for (let i = 0; i < PELLETS[state.weapon]; i += 1) {
    const angle = state.pa + (rng.next() - 0.5) * spread * 2;
    const hit = nearestHit(state, angle);
    if (hit !== undefined) {
      killEnemy(state, hit, now, cfg, rng);
    }
  }
};

/** Silent, unlimited, lethal. Ammo runs out, so this is the sustainable loop. */
export const meleePlayer = (
  state: GameState, now: number, cfg: Config, rng: Rng,
): void => {
  if (state.dead) {
    return;
  }
  state.cues.push({ toneHz: 300, pan: 0, durationMs: 40, kind: 'shot', gain: 0.14 });
  for (const e of state.enemies) {
    const bearing = normaliseAngle(
      Math.atan2(e.y - state.py, e.x - state.px) - state.pa,
    );
    if (e.alive && distanceToPlayer(state, e) < 1.5 && Math.abs(bearing) < 0.9) {
      killEnemy(state, e, now, cfg, rng);
    }
  }
};

/** No ammo pickups. Only whole weapons, off bodies. */
export const lootWeapon = (state: GameState): void => {
  const corpses = state.enemies.filter(
    (e) => !e.alive && !e.looted && e.archetype.magazine > 0 &&
      distanceToPlayer(state, e) < 1.6,
  );
  if (corpses.length === 0) {
    return;
  }
  const target = corpses.reduce((best, e) =>
    distanceToPlayer(state, e) < distanceToPlayer(state, best) ? e : best);
  target.looted = true;
  state.weapon = target.archetype.drops;
  state.ammo = target.archetype.magazine;
  state.cues.push({ toneHz: 660, pan: 0, durationMs: 60, kind: 'pickup', gain: 0.14 });
};
