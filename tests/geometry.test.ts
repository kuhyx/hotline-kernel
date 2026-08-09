import { describe, expect, it } from 'vitest';
import {
  clearRay, distanceToPlayer, inFov, isAudible, isSolid, normaliseAngle, relativeAngle,
} from '../src/core/geometry.js';
import { enemyAt, openGrid, stateWith } from './helpers.js';

describe('isSolid', () => {
  const grid = openGrid();
  it('reports walls', () => { expect(isSolid(grid, 0.5, 0.5)).toBe(true); });
  it('reports floor', () => { expect(isSolid(grid, 5.5, 5.5)).toBe(false); });
  it('treats off-grid rows as solid', () => { expect(isSolid(grid, 5, -1)).toBe(true); });
  it('treats off-grid columns as solid', () => { expect(isSolid(grid, 99, 5)).toBe(true); });
});

describe('clearRay', () => {
  it('passes through open space', () => {
    expect(clearRay(openGrid(), 2.5, 5.5, 8.5, 5.5)).toBe(true);
  });
  it('is blocked by a wall', () => {
    const grid = ['#####', '#...#', '#.#.#', '#...#', '#####'];
    expect(clearRay(grid, 1.5, 2.5, 3.5, 2.5)).toBe(false);
  });
  it('handles zero-length rays', () => {
    expect(clearRay(openGrid(), 5.5, 5.5, 5.5, 5.5)).toBe(true);
  });
});

describe('normaliseAngle', () => {
  it('wraps above pi', () => { expect(normaliseAngle(Math.PI * 3)).toBeCloseTo(-Math.PI); });
  it('wraps below -pi', () => { expect(normaliseAngle(-Math.PI * 3)).toBeCloseTo(-Math.PI); });
  it('leaves in-range values alone', () => { expect(normaliseAngle(1)).toBeCloseTo(1); });
});

describe('field of view and bearing', () => {
  it('sees an enemy dead ahead', () => {
    const s = stateWith([enemyAt(8.5, 5.5)]);
    expect(relativeAngle(s, s.enemies[0]!)).toBeCloseTo(0);
    expect(inFov(s, s.enemies[0]!, 100)).toBe(true);
  });
  it('does not see an enemy behind', () => {
    const s = stateWith([enemyAt(2.5, 5.5)]);
    expect(inFov(s, s.enemies[0]!, 100)).toBe(false);
  });
  it('narrows with a smaller cone', () => {
    const s = stateWith([enemyAt(8.5, 8.0)]);
    expect(inFov(s, s.enemies[0]!, 120)).toBe(true);
    expect(inFov(s, s.enemies[0]!, 20)).toBe(false);
  });
});

describe('isAudible', () => {
  it('hears a nearby enemy in the open', () => {
    const s = stateWith([enemyAt(8.5, 5.5)]);
    expect(isAudible(s, s.enemies[0]!)).toBe(true);
  });
  it('does not hear beyond the tell radius', () => {
    const s = stateWith([enemyAt(8.5, 5.5, 'rusher')]);
    expect(isAudible(s, s.enemies[0]!)).toBe(false);
  });
  it('is true at zero distance', () => {
    const s = stateWith([enemyAt(5.5, 5.5)]);
    expect(isAudible(s, s.enemies[0]!)).toBe(true);
  });
  it('is blocked by a solid wall between', () => {
    const grid = [
      '#########', '#.......#', '#.......#', '#.......#',
      '####.####', '#.......#', '#.......#', '#########',
    ];
    const s = stateWith([enemyAt(1.5, 6.5)], { grid, px: 1.5, py: 1.5 });
    // offset rays all land on the same wall band
    expect(isAudible(s, s.enemies[0]!)).toBe(false);
  });
});

describe('distanceToPlayer', () => {
  it('measures euclidean distance', () => {
    const s = stateWith([enemyAt(8.5, 5.5)]);
    expect(distanceToPlayer(s, s.enemies[0]!)).toBeCloseTo(3);
  });
});
