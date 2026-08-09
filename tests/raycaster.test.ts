import { describe, expect, it } from 'vitest';
import {
  drawHud, drawSprites, drawThreatArcs, drawWalls, renderFrame,
} from '../src/render/raycaster.js';
import { cfg, enemyAt, recordingCtx, stateWith } from './helpers.js';

const VP = { width: 64, height: 40 } as const;
const buf = (): Float32Array => new Float32Array(VP.width);

describe('drawWalls', () => {
  it('writes one depth per column and paints every column', () => {
    const ctx = recordingCtx();
    const z = buf();
    drawWalls(ctx, stateWith([]), VP, cfg(), z);
    expect(z.every((d) => d > 0)).toBe(true);
    expect(ctx.calls.filter((c) => c.startsWith('fillRect')).length)
      .toBe(VP.width + 2);
  });
  it('reports a nearer wall when the player stands next to one', () => {
    const near = buf();
    const far = buf();
    drawWalls(recordingCtx(), stateWith([], { px: 1.6, pa: Math.PI }), VP, cfg(), near);
    drawWalls(recordingCtx(), stateWith([], { px: 9.5, pa: Math.PI }), VP, cfg(), far);
    expect(near[Math.floor(VP.width / 2)]!).toBeLessThan(far[Math.floor(VP.width / 2)]!);
  });
  it('handles an axis-aligned ray without dividing by zero', () => {
    const z = buf();
    drawWalls(recordingCtx(), stateWith([], { pa: 0 }), VP, cfg({ fovDegrees: 90 }), z);
    expect(Number.isFinite(z[0]!)).toBe(true);
  });
});

describe('drawSprites', () => {
  it('draws an enemy standing in front of the player', () => {
    const ctx = recordingCtx();
    const z = buf();
    z.fill(50);
    drawSprites(ctx, stateWith([enemyAt(7.5, 5.5)]), VP, cfg(), z, 0);
    expect(ctx.calls.some((c) => c.startsWith('fillRect'))).toBe(true);
  });
  it('skips an enemy behind the camera plane', () => {
    const ctx = recordingCtx();
    const z = buf();
    z.fill(50);
    drawSprites(ctx, stateWith([enemyAt(2.5, 5.5)]), VP, cfg(), z, 0);
    expect(ctx.calls).toHaveLength(0);
  });
  it('still draws an occluded enemy when silhouettes are on', () => {
    const z = buf();
    z.fill(0.01);
    const on = recordingCtx();
    drawSprites(on, stateWith([enemyAt(7.5, 5.5)]), VP, cfg({ silhouettes: true }), z, 0);
    const off = recordingCtx();
    drawSprites(off, stateWith([enemyAt(7.5, 5.5)]), VP, cfg({ silhouettes: false }), z, 0);
    expect(on.calls.length).toBeGreaterThan(off.calls.length);
  });
  it('paints a wind-up bar on a committing enemy', () => {
    const z = buf();
    z.fill(50);
    const ctx = recordingCtx();
    const e = enemyAt(7.5, 5.5, 'grunt', {
      committing: true, grantedAt: 0, deadline: 1000,
    });
    drawSprites(ctx, stateWith([e]), VP, cfg(), z, 500);
    expect(ctx.calls.filter((c) => c.startsWith('fillRect')).length).toBeGreaterThan(2);
  });
  it('draws corpses dimmed', () => {
    const z = buf();
    z.fill(50);
    const ctx = recordingCtx();
    drawSprites(ctx, stateWith([enemyAt(7.5, 5.5, 'grunt', { alive: false })]), VP, cfg(), z, 0);
    expect(ctx.calls.length).toBeGreaterThan(0);
  });
  it('draws a visible projectile and skips an occluded one', () => {
    const shot = {
      x: 7.5, y: 5.5, dx: -1, dy: 0, speed: 9, travelled: 0, maxRange: 14,
      blind: false, sourceSeen: true, sourceHeard: true,
    };
    const open = buf();
    open.fill(50);
    const visible = recordingCtx();
    drawSprites(visible, stateWith([], { projectiles: [shot] }), VP, cfg(), open, 0);
    expect(visible.calls.some((c) => c.startsWith('arc'))).toBe(true);

    const blocked = buf();
    blocked.fill(0.01);
    const hidden = recordingCtx();
    drawSprites(hidden, stateWith([], { projectiles: [shot] }), VP, cfg(), blocked, 0);
    expect(hidden.calls.some((c) => c.startsWith('arc'))).toBe(false);
  });
  it('skips a projectile behind the camera and one off the side', () => {
    const z = buf();
    z.fill(50);
    const behind = {
      x: 2.5, y: 5.5, dx: 1, dy: 0, speed: 9, travelled: 0, maxRange: 14,
      blind: true, sourceSeen: false, sourceHeard: true,
    };
    const ctx = recordingCtx();
    drawSprites(ctx, stateWith([], { projectiles: [behind] }), VP, cfg(), z, 0);
    expect(ctx.calls.some((c) => c.startsWith('arc'))).toBe(false);

    const side = { ...behind, x: 6.0, y: 1.0, blind: false };
    const ctx2 = recordingCtx();
    drawSprites(ctx2, stateWith([], { projectiles: [side] }), VP, cfg({ fovDegrees: 60 }), z, 0);
    expect(ctx2.calls.some((c) => c.startsWith('arc'))).toBe(false);
  });
});

describe('drawThreatArcs', () => {
  const committing = (x: number, y: number) => enemyAt(x, y, 'grunt', {
    committing: true, grantedAt: 0, deadline: 1000,
  });
  it('marks a committing enemy behind the player', () => {
    const ctx = recordingCtx();
    drawThreatArcs(ctx, stateWith([committing(2.5, 5.5)]), VP, cfg(), 500);
    expect(ctx.calls.filter((c) => c.startsWith('fillRect'))).toHaveLength(1);
  });
  it('marks left and right edges by bearing', () => {
    const left = recordingCtx();
    drawThreatArcs(left, stateWith([committing(4.5, 3.0)]), VP, cfg(), 500);
    const right = recordingCtx();
    drawThreatArcs(right, stateWith([committing(4.5, 8.0)]), VP, cfg(), 500);
    expect(left.calls[0]).not.toBe(right.calls[0]);
  });
  it('does not mark an enemy already in view', () => {
    const ctx = recordingCtx();
    drawThreatArcs(ctx, stateWith([committing(8.5, 5.5)]), VP, cfg(), 500);
    expect(ctx.calls).toHaveLength(0);
  });
  it('does not mark the dead or the uncommitted', () => {
    const dead = recordingCtx();
    drawThreatArcs(dead, stateWith([enemyAt(2.5, 5.5, 'grunt', { alive: false })]), VP, cfg(), 0);
    expect(dead.calls).toHaveLength(0);
    const idle = recordingCtx();
    drawThreatArcs(idle, stateWith([enemyAt(2.5, 5.5)]), VP, cfg(), 0);
    expect(idle.calls).toHaveLength(0);
  });
  it('draws nothing when the channel is switched off', () => {
    const ctx = recordingCtx();
    drawThreatArcs(ctx, stateWith([committing(2.5, 5.5)]), VP, cfg({ threatArcs: false }), 500);
    expect(ctx.calls).toHaveLength(0);
  });
});

describe('drawHud', () => {
  it('shows fists with no ammo count', () => {
    const ctx = recordingCtx();
    drawHud(ctx, stateWith([]), VP);
    expect(ctx.calls.some((c) => c.includes('fists'))).toBe(true);
  });
  it('shows the weapon and its magazine', () => {
    const ctx = recordingCtx();
    drawHud(ctx, stateWith([], { weapon: 'rifle', ammo: 3 }), VP);
    expect(ctx.calls.some((c) => c.includes('rifle  3'))).toBe(true);
  });
  it('shows the chain only above one', () => {
    const low = recordingCtx();
    drawHud(low, stateWith([], { combo: 1 }), VP);
    expect(low.calls.some((c) => c.includes('x1'))).toBe(false);
    const high = recordingCtx();
    drawHud(high, stateWith([], { combo: 4 }), VP);
    expect(high.calls.some((c) => c.includes('x4'))).toBe(true);
  });
  it('tints the frame on death', () => {
    const alive = recordingCtx();
    drawHud(alive, stateWith([]), VP);
    const dead = recordingCtx();
    drawHud(dead, stateWith([], { dead: true }), VP);
    expect(dead.calls.length).toBeGreaterThan(alive.calls.length);
  });
});

describe('renderFrame', () => {
  it('runs the whole pipeline without throwing', () => {
    const ctx = recordingCtx();
    const e = enemyAt(7.5, 5.5, 'grunt', { committing: true, grantedAt: 0, deadline: 1000 });
    renderFrame(ctx, stateWith([e]), VP, cfg(), buf(), 500);
    expect(ctx.calls.length).toBeGreaterThan(VP.width);
  });
});
