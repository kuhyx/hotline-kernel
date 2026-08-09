import { describe, expect, it } from 'vitest';
import {
  alertWithin, firePlayerWeapon, killEnemy, killPlayer, lootWeapon, magazineFor, meleePlayer,
} from '../src/core/combat.js';
import { makeRng } from '../src/core/rng.js';
import { cfg, enemyAt, stateWith } from './helpers.js';

const rng = (): ReturnType<typeof makeRng> => makeRng(5);

describe('magazineFor', () => {
  it('maps weapons to their magazine size', () => {
    expect(magazineFor('fists')).toBe(0);
    expect(magazineFor('pistol')).toBe(6);
    expect(magazineFor('shotgun')).toBe(2);
    expect(magazineFor('rifle')).toBe(4);
  });
});

describe('alertWithin', () => {
  it('wakes enemies inside the radius and leaves the rest asleep', () => {
    const near = enemyAt(6.5, 5.5, 'grunt', { alerted: false });
    const far = enemyAt(9.5, 5.5, 'grunt', { alerted: false });
    const dead = enemyAt(6.0, 5.5, 'grunt', { alerted: false, alive: false });
    const s = stateWith([near, far, dead]);
    alertWithin(s, 2);
    expect(near.alerted).toBe(true);
    expect(far.alerted).toBe(false);
    expect(dead.alerted).toBe(false);
  });
});

describe('killEnemy', () => {
  it('builds the chain and the score', () => {
    const s = stateWith([enemyAt(8.5, 5.5), enemyAt(8.6, 5.5)]);
    killEnemy(s, s.enemies[0]!, 0, cfg(), rng());
    killEnemy(s, s.enemies[1]!, 0, cfg(), rng());
    expect(s.combo).toBe(2);
    expect(s.bestCombo).toBe(2);
    expect(s.score).toBe(300);
  });
  it('frees the token the victim was holding', () => {
    const holder = enemyAt(8.5, 5.5, 'grunt', { committing: true, deadline: 900, grantedAt: 0 });
    const s = stateWith([holder], { lastGrantAt: -9999 });
    killEnemy(s, holder, 100, cfg(), rng());
    expect(holder.committing).toBe(false);
  });
  it('hands the freed window to the next holder under the inherit rule', () => {
    const dying = enemyAt(8.5, 5.5, 'grunt', { committing: true, deadline: 400, grantedAt: 0 });
    const next = enemyAt(8.6, 5.6, 'grunt');
    const s = stateWith([dying, next], { lastGrantAt: -9999 });
    killEnemy(s, dying, 100, cfg({ inherit: 'inheritRemaining' }), rng());
    expect(next.committing).toBe(true);
    expect(next.baseWindup).toBe(300);
  });
  it('raises a kill cue', () => {
    const s = stateWith([enemyAt(8.5, 5.5)]);
    killEnemy(s, s.enemies[0]!, 0, cfg(), rng());
    expect(s.cues.some((c) => c.kind === 'kill')).toBe(true);
  });
});

describe('killPlayer and the fairness log', () => {
  it('records a death that was seen at commit', () => {
    const s = stateWith([], { levelStartedAt: 0 });
    killPlayer(s, true, false, 2500);
    expect(s.log).toMatchObject({ deaths: 1, seenAtCommit: 1, heardAtCommit: 0, unannounced: 0 });
    expect(s.log.survivalMs).toStrictEqual([2500]);
  });
  it('records a death that was only heard at commit', () => {
    const s = stateWith([]);
    killPlayer(s, false, true, 0);
    expect(s.log).toMatchObject({ seenAtCommit: 0, heardAtCommit: 1, unannounced: 0 });
  });
  it('records an unannounced death, which is the invariant violation', () => {
    const s = stateWith([]);
    killPlayer(s, false, false, 0);
    expect(s.log.unannounced).toBe(1);
  });
  it('breaks the chain', () => {
    const s = stateWith([], { combo: 9 });
    killPlayer(s, true, true, 0);
    expect(s.combo).toBe(0);
  });
  it('is idempotent while already dead', () => {
    const s = stateWith([]);
    killPlayer(s, true, true, 0);
    killPlayer(s, true, true, 0);
    expect(s.log.deaths).toBe(1);
  });
});

describe('firePlayerWeapon', () => {
  it('does nothing with fists', () => {
    const s = stateWith([enemyAt(8.5, 5.5)], { weapon: 'fists', ammo: 0 });
    firePlayerWeapon(s, 0, cfg(), rng());
    expect(s.enemies[0]!.alive).toBe(true);
    expect(s.cues).toHaveLength(0);
  });
  it('does nothing while dead', () => {
    const s = stateWith([enemyAt(8.5, 5.5)], { weapon: 'pistol', ammo: 6, dead: true });
    firePlayerWeapon(s, 0, cfg(), rng());
    expect(s.ammo).toBe(6);
  });
  it('dry-fires on an empty magazine', () => {
    const s = stateWith([enemyAt(8.5, 5.5)], { weapon: 'pistol', ammo: 0 });
    firePlayerWeapon(s, 0, cfg(), rng());
    expect(s.cues.some((c) => c.kind === 'dryFire')).toBe(true);
    expect(s.enemies[0]!.alive).toBe(true);
  });
  it('kills a target dead ahead and spends a round', () => {
    const s = stateWith([enemyAt(8.5, 5.5)], { weapon: 'pistol', ammo: 6 });
    firePlayerWeapon(s, 0, cfg(), rng());
    expect(s.enemies[0]!.alive).toBe(false);
    expect(s.ammo).toBe(5);
  });
  it('misses an enemy outside the aim cone', () => {
    const s = stateWith([enemyAt(5.5, 9.0)], { weapon: 'pistol', ammo: 6 });
    firePlayerWeapon(s, 0, cfg(), rng());
    expect(s.enemies[0]!.alive).toBe(true);
  });
  it('cannot shoot through a wall', () => {
    const grid = ['#######', '#.....#', '###.###', '#.....#', '#######'];
    const s = stateWith([enemyAt(1.5, 3.5)], {
      grid, px: 1.5, py: 1.5, pa: Math.PI / 2, weapon: 'pistol', ammo: 6,
    });
    firePlayerWeapon(s, 0, cfg(), rng());
    expect(s.enemies[0]!.alive).toBe(true);
  });
  it('picks the nearest of two aligned targets', () => {
    const near = enemyAt(7.5, 5.5);
    const far = enemyAt(9.5, 5.5);
    const s = stateWith([far, near], { weapon: 'rifle', ammo: 4 });
    firePlayerWeapon(s, 0, cfg(), rng());
    expect(near.alive).toBe(false);
    expect(far.alive).toBe(true);
  });
  it('fires several pellets from a shotgun', () => {
    const s = stateWith([enemyAt(6.5, 5.5)], { weapon: 'shotgun', ammo: 2 });
    firePlayerWeapon(s, 0, cfg(), rng());
    expect(s.enemies[0]!.alive).toBe(false);
    expect(s.ammo).toBe(1);
  });
  it('draws the room', () => {
    const sleeper = enemyAt(9.0, 5.5, 'grunt', { alerted: false });
    const s = stateWith([sleeper], { weapon: 'pistol', ammo: 6 });
    firePlayerWeapon(s, 0, cfg(), rng());
    expect(sleeper.alerted).toBe(true);
  });
});

describe('meleePlayer', () => {
  it('kills what is adjacent and in front', () => {
    const s = stateWith([enemyAt(6.5, 5.5)]);
    meleePlayer(s, 0, cfg(), rng());
    expect(s.enemies[0]!.alive).toBe(false);
  });
  it('does not reach past 1.5 units', () => {
    const s = stateWith([enemyAt(8.5, 5.5)]);
    meleePlayer(s, 0, cfg(), rng());
    expect(s.enemies[0]!.alive).toBe(true);
  });
  it('does not swing behind', () => {
    const s = stateWith([enemyAt(4.6, 5.5)]);
    meleePlayer(s, 0, cfg(), rng());
    expect(s.enemies[0]!.alive).toBe(true);
  });
  it('leaves corpses alone', () => {
    const s = stateWith([enemyAt(6.0, 5.5, 'grunt', { alive: false })]);
    meleePlayer(s, 0, cfg(), rng());
    expect(s.combo).toBe(0);
  });
  it('is silent: it does not alert the room', () => {
    const sleeper = enemyAt(9.0, 5.5, 'grunt', { alerted: false });
    const s = stateWith([sleeper]);
    meleePlayer(s, 0, cfg(), rng());
    expect(sleeper.alerted).toBe(false);
  });
  it('does nothing while dead', () => {
    const s = stateWith([enemyAt(6.0, 5.5)], { dead: true });
    meleePlayer(s, 0, cfg(), rng());
    expect(s.enemies[0]!.alive).toBe(true);
  });
});

describe('lootWeapon', () => {
  it('takes the gun off a nearby corpse', () => {
    const s = stateWith([enemyAt(6.0, 5.5, 'rifleman', { alive: false })]);
    lootWeapon(s);
    expect(s.weapon).toBe('rifle');
    expect(s.ammo).toBe(4);
    expect(s.enemies[0]!.looted).toBe(true);
  });
  it('refuses to loot the same corpse twice', () => {
    const s = stateWith([enemyAt(6.0, 5.5, 'rifleman', { alive: false })]);
    lootWeapon(s);
    s.ammo = 0;
    lootWeapon(s);
    expect(s.ammo).toBe(0);
  });
  it('ignores the living', () => {
    const s = stateWith([enemyAt(6.0, 5.5, 'rifleman')]);
    lootWeapon(s);
    expect(s.weapon).toBe('fists');
  });
  it('ignores corpses that carried nothing', () => {
    const s = stateWith([enemyAt(6.0, 5.5, 'rusher', { alive: false })]);
    lootWeapon(s);
    expect(s.weapon).toBe('fists');
  });
  it('ignores corpses out of reach', () => {
    const s = stateWith([enemyAt(9.0, 5.5, 'rifleman', { alive: false })]);
    lootWeapon(s);
    expect(s.weapon).toBe('fists');
  });
  it('prefers the nearest of several corpses', () => {
    const s = stateWith([
      enemyAt(6.9, 5.5, 'rifleman', { alive: false }),
      enemyAt(6.0, 5.5, 'shotgunner', { alive: false }),
    ]);
    lootWeapon(s);
    expect(s.weapon).toBe('shotgun');
  });
});
