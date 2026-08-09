import type { Enemy, GameState } from './types.js';

export const TAU = Math.PI * 2;

/** Walls are '#'. Anything off the grid counts as solid. */
export const isSolid = (grid: readonly string[], x: number, y: number): boolean => {
  const row = grid[Math.floor(y)];
  if (row === undefined) {
    return true;
  }
  const cell = row[Math.floor(x)];
  return cell === undefined || cell === '#';
};

/** Sampled segment test. No occlusion model: the cheap version, by design. */
export const clearRay = (
  grid: readonly string[],
  ax: number, ay: number, bx: number, by: number,
): boolean => {
  const dx = bx - ax;
  const dy = by - ay;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) * 8));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (isSolid(grid, ax + dx * t, ay + dy * t)) {
      return false;
    }
  }
  return true;
};

export const normaliseAngle = (angle: number): number => {
  const wrapped = ((angle + Math.PI) % TAU + TAU) % TAU;
  return wrapped - Math.PI;
};

/** Signed bearing of an enemy relative to where the player is facing. */
export const relativeAngle = (state: GameState, enemy: Enemy): number =>
  normaliseAngle(Math.atan2(enemy.y - state.py, enemy.x - state.px) - state.pa);

/**
 * Silhouettes are through-wall, so "in the player's field of view" needs no
 * line-of-sight check: if it is in the cone, the player can see it.
 */
export const inFov = (state: GameState, enemy: Enemy, fovDegrees: number): boolean =>
  Math.abs(relativeAngle(state, enemy)) < (fovDegrees * Math.PI) / 180 / 2;

/**
 * Three rays, not one. A single ray through a doorway clips the jamb or does
 * not, essentially at random, so two enemies side by side get opposite answers.
 */
export const isAudible = (state: GameState, enemy: Enemy): boolean => {
  const dx = state.px - enemy.x;
  const dy = state.py - enemy.y;
  const distance = Math.hypot(dx, dy);
  if (distance > enemy.archetype.range) {
    return false;
  }
  if (distance === 0) {
    return true;
  }
  const nx = -dy / distance;
  const ny = dx / distance;
  const offset = 0.28;
  return (
    clearRay(state.grid, enemy.x, enemy.y, state.px, state.py) ||
    clearRay(state.grid, enemy.x + nx * offset, enemy.y + ny * offset, state.px, state.py) ||
    clearRay(state.grid, enemy.x - nx * offset, enemy.y - ny * offset, state.px, state.py)
  );
};

export const distanceToPlayer = (state: GameState, enemy: Enemy): number =>
  Math.hypot(state.px - enemy.x, state.py - enemy.y);
