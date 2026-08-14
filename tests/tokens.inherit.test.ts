import { describe, expect, it } from 'vitest';
import { killEnemy } from '../src/core/combat.js';
import { makeRng } from '../src/core/rng.js';
import { loadLevel } from '../src/core/sim.js';
import { heldBy, serviceTokens } from '../src/core/tokens.js';
import type { Enemy } from '../src/core/types.js';
import { cfg, enemyAt, guard, stateWith } from './helpers.js';

const rng = (): ReturnType<typeof makeRng> => makeRng(99);

describe('a freed wind-up survives until someone can take it', () => {
  const dying = (): Enemy => enemyAt(7.5, 5.5, 'grunt', {
    alerted: true, committing: true, grantedAt: 0, deadline: 900,
  });

  it('parks the remainder when the stagger refuses the grant', () => {
    const kill = dying();
    const waiting = enemyAt(7.6, 5.6, 'grunt', { alerted: true });
    // lastGrantAt 100 puts the kill at t=100 inside the 150ms stagger.
    const s = stateWith([kill, waiting], { lastGrantAt: 100 });
    const c = cfg({ inherit: 'inheritRemaining', rangedTokens: 1, grantStaggerMs: 150 });

    killEnemy(s, kill, 100, c, rng());
    expect(heldBy(s, false)).toHaveLength(0);
    expect(s.pendingInheritMs).toBe(800);

    // Once the stagger has passed the parked window is handed on, not lost.
    serviceTokens(s, 400, c, rng(), undefined);
    expect(waiting.baseWindup).toBe(800);
    expect(s.pendingInheritMs).toBeUndefined();
  });

  it('keeps the oldest debt when a second kill lands first', () => {
    const first = dying();
    const second = enemyAt(7.7, 5.7, 'grunt', {
      alerted: true, committing: true, grantedAt: 0, deadline: 600,
    });
    const s = stateWith([first, second], { lastGrantAt: 100 });
    const c = cfg({ inherit: 'inheritRemaining', rangedTokens: 0, grantStaggerMs: 150 });
    killEnemy(s, first, 100, c, rng());
    killEnemy(s, second, 100, c, rng());
    expect(s.pendingInheritMs).toBe(800);
  });

  it('clears the debt on a new level: a fresh fight owes nothing', () => {
    const s = stateWith([dying()], { pendingInheritMs: 500 });
    loadLevel(s, 1, 0, 'fists', 0);
    expect(s.pendingInheritMs).toBeUndefined();
  });

  it('never inherits a window below the reaction floor', () => {
    // A 5ms remainder off a dying grunt must not hand a hound an unanswerable
    // commit. `unannounced` stays 0 either way, so only the floor catches this.
    const kill = enemyAt(7.5, 5.5, 'grunt', {
      alerted: true, committing: true, grantedAt: 0, deadline: 105,
    });
    const hound = enemyAt(7.0, 5.5, 'hound', { alerted: true });
    const s = stateWith([kill, hound], { lastGrantAt: 100 });
    const c = cfg({
      inherit: 'inheritRemaining', rangedTokens: 0, meleeTokens: 1, grantStaggerMs: 150,
    });
    killEnemy(s, kill, 100, c, rng());
    serviceTokens(s, 5000, c, rng(), undefined);
    expect(hound.baseWindup).toBe(300);
  });

  it('still shortens a slow archetype, so dawdling is punished', () => {
    const kill = enemyAt(7.5, 5.5, 'grunt', {
      alerted: true, committing: true, grantedAt: 0, deadline: 700,
    });
    const rifle = enemyAt(8.5, 5.5, 'rifleman', { alerted: true });
    const s = stateWith([kill, rifle], { lastGrantAt: 100 });
    const c = cfg({ inherit: 'inheritRemaining', rangedTokens: 1, grantStaggerMs: 150 });
    killEnemy(s, kill, 100, c, rng());
    serviceTokens(s, 5000, c, rng(), undefined);
    expect(rifle.baseWindup).toBe(600);
  });

  it('never inherits MORE than the archetype would get fresh', () => {
    const s = stateWith([enemyAt(7.0, 5.5, 'hound', { alerted: true })], { lastGrantAt: -9999 });
    s.pendingInheritMs = 99999;
    const c = cfg({ inherit: 'inheritRemaining', rangedTokens: 0, meleeTokens: 1 });
    serviceTokens(s, 5000, c, rng(), undefined);
    expect(s.enemies[0]!.baseWindup).toBe(350);
  });

  it('keeps the largest debt: a zero remainder cannot mask a real one', () => {
    const s = stateWith([enemyAt(8.5, 5.5)], { lastGrantAt: 1e9, pendingInheritMs: 0 });
    const dead = enemyAt(7.5, 5.5, 'grunt', {
      alerted: true, committing: true, grantedAt: 0, deadline: 1000,
    });
    s.enemies.push(dead);
    killEnemy(s, dead, 100, cfg({ inherit: 'inheritRemaining' }), rng());
    expect(s.pendingInheritMs).toBe(900);
  });

  it('drops a debt incurred while the fresh rule was active', () => {
    // `inherit` is a live Rig toggle; a window freed under `fresh` must not
    // resurface after the switch.
    const kill = enemyAt(7.5, 5.5, 'grunt', {
      alerted: true, committing: true, grantedAt: 0, deadline: 400,
    });
    const next = enemyAt(8.5, 5.5, 'grunt', { alerted: true });
    const s = stateWith([kill, next], { lastGrantAt: 100 });
    killEnemy(s, kill, 100, cfg({ inherit: 'fresh', rangedTokens: 1 }), rng());
    expect(s.pendingInheritMs).toBeUndefined();

    serviceTokens(s, 5000, cfg({ inherit: 'inheritRemaining', rangedTokens: 1 }), rng(), undefined);
    expect(next.baseWindup).toBe(1000);
  });

  it('hands a parked window to a melee holder too', () => {
    const kill = enemyAt(7.5, 5.5, 'grunt', {
      alerted: true, committing: true, grantedAt: 0, deadline: 900,
    });
    const rusher = enemyAt(6.0, 5.5, 'rusher', { alerted: true });
    const s = stateWith([kill, rusher], { lastGrantAt: 100 });
    const c = cfg({
      inherit: 'inheritRemaining', rangedTokens: 0, meleeTokens: 1, grantStaggerMs: 150,
    });
    killEnemy(s, kill, 100, c, rng());
    serviceTokens(s, 5000, c, rng(), undefined);
    expect(rusher.baseWindup).toBe(500);
    expect(s.pendingInheritMs).toBeUndefined();
  });

  it('parks nothing when the kill freed nothing', () => {
    const idle = enemyAt(7.5, 5.5, 'grunt', { alerted: true });
    const s = stateWith([idle, guard()], { lastGrantAt: 1e9 });
    killEnemy(s, idle, 100, cfg({ inherit: 'inheritRemaining' }), rng());
    expect(s.pendingInheritMs).toBeUndefined();
  });
});
