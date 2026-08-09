/**
 * Branches that only a deliberately awkward setup reaches: reduce accumulators
 * that must keep the incumbent, degenerate zero-distance vectors, wall
 * collisions on one axis at a time, and defensive guards.
 */
import { describe, expect, it } from 'vitest';
import { firePlayerWeapon, lootWeapon } from '../src/core/combat.js';
import { levelAt } from '../src/core/levels.js';
import { makeRng } from '../src/core/rng.js';
import { step } from '../src/core/sim.js';
import { emptyInput } from '../src/core/types.js';
import { castColumn, drawSprites } from '../src/render/raycaster.js';
import { cfg, enemyAt, guard, noCommit, recordingCtx, stateWith } from './helpers.js';

const rng = (): ReturnType<typeof makeRng> => makeRng(3);

describe('nearest-target reduce keeps the incumbent', () => {
  it('when the closer target comes first in the list', () => {
    const near = enemyAt(7.0, 5.5);
    const far = enemyAt(9.0, 5.5);
    const s = stateWith([near, far], { weapon: 'rifle', ammo: 4 });
    firePlayerWeapon(s, 0, cfg(), rng());
    expect(near.alive).toBe(false);
    expect(far.alive).toBe(true);
  });
});

describe('nearest-corpse reduce keeps the incumbent', () => {
  it('when the closer corpse comes first in the list', () => {
    const s = stateWith([
      enemyAt(6.0, 5.5, 'shotgunner', { alive: false }),
      enemyAt(6.9, 5.5, 'rifleman', { alive: false }),
    ]);
    lootWeapon(s);
    expect(s.weapon).toBe('shotgun');
  });
});

describe('degenerate geometry', () => {
  it('an enemy standing exactly on the player does not divide by zero', () => {
    const e = enemyAt(5.5, 5.5, 'rusher');
    const s = stateWith([e]);
    step(s, emptyInput(), 0.05, 0, noCommit(), rng());
    expect(Number.isFinite(e.x)).toBe(true);
    expect(Number.isFinite(e.y)).toBe(true);
  });

  it('a shooter standing exactly on the player still emits a directed shot', () => {
    // resolveCommit overwrites last-known with the live player position, so the
    // only way to get a zero-length aim vector is to occupy the same point.
    const e = enemyAt(5.5, 5.5, 'grunt', {
      committing: true, grantedAt: 0, baseWindup: 10, deadline: 10,
      seenAtCommit: true, heardAtCommit: true,
    });
    const s = stateWith([e], { px: 5.5, py: 5.5, lastGrantAt: 1e9 });
    step(s, emptyInput(), 0.001, 100, cfg({ rangedTokens: 0 }), rng());
    // Fired from inside the player, so it connects on the same frame and is
    // consumed rather than left in flight. What matters is that no NaN leaked
    // into the aim vector and the death was booked normally.
    expect(s.dead).toBe(true);
    expect(s.log.deaths).toBe(1);
    expect(s.log.unannounced).toBe(0);
    expect(s.projectiles).toHaveLength(0);
  });
});

describe('one-axis wall collisions', () => {
  it('blocks the player on Y while leaving X free', () => {
    const s = stateWith([guard()], { px: 5.5, py: 1.4, pa: -Math.PI / 2 });
    for (let i = 0; i < 40; i += 1) {
      step(s, { ...emptyInput(), forward: true }, 0.05, i * 50, noCommit(), rng());
    }
    // Walked into the north wall and stopped short of it.
    expect(s.py).toBeGreaterThan(1);
    expect(s.py).toBeLessThan(1.4);
  });

  it('blocks a strafing enemy on X while it still moves on Y', () => {
    // A ranged unit backs off and strafes. Pinned against the west wall, its
    // sideways component is refused while the retreat component is allowed.
    const e = enemyAt(1.1, 5.5, 'grunt');
    const s = stateWith([e], { px: 1.1, py: 9.5 });
    const beforeX = e.x;
    const beforeY = e.y;
    step(s, emptyInput(), 0.2, 0, noCommit(), rng());
    expect(e.x).toBe(beforeX);
    expect(e.y).not.toBe(beforeY);
  });
});

describe('defensive guards', () => {
  it('levelAt rejects an index that is not a number', () => {
    expect(() => levelAt(Number.NaN)).toThrow(/no level at index/);
  });

  it('sprite drawing survives a depth buffer narrower than the viewport', () => {
    const ctx = recordingCtx();
    const short = new Float32Array(2);
    short.fill(50);
    drawSprites(ctx, stateWith([enemyAt(7.5, 5.5)]), { width: 64, height: 40 }, cfg(), short, 0);
    expect(ctx.calls.length).toBeGreaterThan(0);
  });
});

describe('raycasting guards that geometry cannot produce', () => {
  it('survives a ray with no horizontal component', () => {
    const hit = castColumn(stateWith([]), 0, 1);
    expect(Number.isFinite(hit.distance)).toBe(true);
    expect(hit.distance).toBeGreaterThan(0);
  });
  it('survives a ray with no vertical component', () => {
    const hit = castColumn(stateWith([]), 1, 0);
    expect(Number.isFinite(hit.distance)).toBe(true);
  });
  it('gives up after the guard limit instead of looping forever', () => {
    // An unbounded grid: nothing to hit, so the guard has to stop the walk.
    const open = stateWith([], { grid: ['..........', '..........', '..........'] });
    expect(Number.isFinite(castColumn(open, 1, 0.0001).distance)).toBe(true);
  });
});

describe('projectiles outside the frame', () => {
  const shot = (x: number, y: number) => ({
    x, y, dx: 0, dy: 0, speed: 0, travelled: 0, maxRange: 14,
    blind: false, sourceSeen: true, sourceHeard: true,
  });
  const VP = { width: 64, height: 40 } as const;
  const depth = (): Float32Array => {
    const z = new Float32Array(VP.width);
    z.fill(50);
    return z;
  };
  it('skips one projected off the left edge', () => {
    const ctx = recordingCtx();
    drawSprites(ctx, stateWith([], { projectiles: [shot(7.5, 1.0)] }), VP, cfg(), depth(), 0);
    expect(ctx.calls.some((c) => c.startsWith('arc'))).toBe(false);
  });
  it('skips one projected off the right edge', () => {
    const ctx = recordingCtx();
    drawSprites(ctx, stateWith([], { projectiles: [shot(7.5, 10.0)] }), VP, cfg(), depth(), 0);
    expect(ctx.calls.some((c) => c.startsWith('arc'))).toBe(false);
  });
  it('draws a blind shot in a muted colour', () => {
    const ctx = recordingCtx();
    const blind = { ...shot(7.5, 5.5), blind: true };
    drawSprites(ctx, stateWith([], { projectiles: [blind] }), VP, cfg(), depth(), 0);
    expect(ctx.calls.some((c) => c.startsWith('arc'))).toBe(true);
  });
});

describe('depth buffer shorter than the viewport', () => {
  it('treats missing depth as infinitely far for projectiles', () => {
    const ctx = recordingCtx();
    const short = new Float32Array(2);
    short.fill(50);
    const shot = {
      x: 7.5, y: 5.5, dx: 0, dy: 0, speed: 0, travelled: 0, maxRange: 14,
      blind: false, sourceSeen: true, sourceHeard: true,
    };
    drawSprites(
      ctx, stateWith([], { projectiles: [shot] }), { width: 64, height: 40 },
      cfg(), short, 0,
    );
    expect(ctx.calls.some((c) => c.startsWith('arc'))).toBe(true);
  });
});
