import { describe, expect, it } from 'vitest';
import { LEVELS, levelAt } from '../src/core/levels.js';
import { makeRng } from '../src/core/rng.js';
import { RESPAWN_DELAY_MS, createState, loadLevel, step } from '../src/core/sim.js';
import { type GameState, type PlayerInput, emptyInput } from '../src/core/types.js';
import { cfg, enemyAt, guard, noCommit, stateWith } from './helpers.js';

const rng = (): ReturnType<typeof makeRng> => makeRng(11);
const input = (over: Partial<PlayerInput> = {}): PlayerInput => ({ ...emptyInput(), ...over });

describe('levels', () => {
  it('wraps forward past the end', () => {
    expect(levelAt(LEVELS.length)).toBe(LEVELS[0]);
  });
  it('wraps backwards', () => {
    expect(levelAt(-1)).toBe(LEVELS[LEVELS.length - 1]);
  });
  it('has no corridors: every level is at least 11 rows of open plan', () => {
    for (const level of LEVELS) {
      expect(level.grid.length).toBeGreaterThanOrEqual(11);
    }
  });
});

describe('createState / loadLevel', () => {
  it('starts on level one with fists and no ammo', () => {
    const s = createState(0);
    expect(s.levelIndex).toBe(0);
    expect(s.weapon).toBe('fists');
    expect(s.enemies.length).toBeGreaterThan(0);
    expect(s.enemies.every((e) => e.alive && !e.alerted)).toBe(true);
  });
  it('carries the weapon and ammo into a new level', () => {
    const s = createState(0);
    loadLevel(s, 1, 100, 'rifle', 3);
    expect(s.weapon).toBe('rifle');
    expect(s.ammo).toBe(3);
    expect(s.levelIndex).toBe(1);
  });
});

describe('player movement', () => {
  it('walks forward', () => {
    const s = stateWith([guard()]);
    step(s, input({ forward: true }), 0.1, 0, noCommit(), rng());
    expect(s.px).toBeGreaterThan(5.5);
  });
  it('walks back, and strafes both ways', () => {
    const back = stateWith([guard()]);
    step(back, input({ back: true }), 0.1, 0, noCommit(), rng());
    expect(back.px).toBeLessThan(5.5);

    const left = stateWith([guard()]);
    step(left, input({ left: true }), 0.1, 0, noCommit(), rng());
    expect(left.py).toBeLessThan(5.5);

    const right = stateWith([guard()]);
    step(right, input({ right: true }), 0.1, 0, noCommit(), rng());
    expect(right.py).toBeGreaterThan(5.5);
  });
  it('turns with the arrow keys', () => {
    const l = stateWith([guard()]);
    step(l, input({ turnLeft: true }), 0.1, 0, noCommit(), rng());
    expect(l.pa).toBeLessThan(0);
    const r = stateWith([guard()]);
    step(r, input({ turnRight: true }), 0.1, 0, noCommit(), rng());
    expect(r.pa).toBeGreaterThan(0);
  });
  it('is stopped by walls on each axis independently', () => {
    const s = stateWith([guard()], { px: 1.4, py: 1.4, pa: Math.PI });
    for (let i = 0; i < 50; i += 1) {
      step(s, input({ forward: true }), 0.05, i * 50, noCommit(), rng());
    }
    expect(s.px).toBeGreaterThan(1);
    expect(s.py).toBeGreaterThan(1);
  });
  it('does not move while dead', () => {
    const s = stateWith([guard()], { dead: true, diedAt: 0 });
    step(s, input({ forward: true }), 0.1, 10, noCommit(), rng());
    expect(s.px).toBe(5.5);
  });
});

describe('combo decay', () => {
  it('breaks on idle time, not on a miss', () => {
    const s = stateWith([guard()], { combo: 5, lastKillAt: 0 });
    step(s, input(), 0.016, 1000, noCommit({ comboBreakMs: 3000 }), rng());
    expect(s.combo).toBe(5);
    step(s, input(), 0.016, 4000, noCommit({ comboBreakMs: 3000 }), rng());
    expect(s.combo).toBe(0);
  });
});

describe('awareness is enemy-side', () => {
  it('wakes an enemy standing behind the player', () => {
    const behind = enemyAt(3.5, 5.5, 'grunt', { alerted: false });
    const s = stateWith([behind], { pa: 0 });
    step(s, input(), 0.016, 0, cfg(), rng());
    expect(behind.alerted).toBe(true);
  });
  it('does not wake an enemy behind a wall', () => {
    const grid = ['#######', '#.....#', '#######', '#.....#', '#######'];
    const hidden = enemyAt(1.5, 3.5, 'grunt', { alerted: false });
    const s = stateWith([hidden], { grid, px: 1.5, py: 1.5 });
    step(s, input(), 0.016, 0, cfg(), rng());
    expect(hidden.alerted).toBe(false);
  });
});

describe('alerted enemies advance', () => {
  it('closes distance instead of holding position', () => {
    const e = enemyAt(9.5, 5.5, 'rusher');
    const s = stateWith([e], { lastGrantAt: 1e9 });
    const before = Math.hypot(s.px - e.x, s.py - e.y);
    for (let i = 0; i < 30; i += 1) {
      step(s, input(), 0.05, i * 50, noCommit(), rng());
    }
    expect(Math.hypot(s.px - e.x, s.py - e.y)).toBeLessThan(before);
  });
  it('backs off when it is closer than it wants to be', () => {
    const e = enemyAt(6.0, 5.5, 'rifleman');
    const s = stateWith([e]);
    const before = Math.hypot(s.px - e.x, s.py - e.y);
    for (let i = 0; i < 20; i += 1) {
      step(s, input(), 0.05, i * 50, noCommit(), rng());
    }
    expect(Math.hypot(s.px - e.x, s.py - e.y)).toBeGreaterThan(before);
  });
  it('leaves an unalerted enemy where it stands', () => {
    const grid = ['#######', '#.....#', '#######', '#.....#', '#######'];
    const e = enemyAt(1.5, 3.5, 'grunt', { alerted: false });
    const s = stateWith([e], { grid, px: 1.5, py: 1.5 });
    step(s, input(), 0.05, 0, cfg(), rng());
    expect(e.x).toBe(1.5);
  });
});

describe('commit resolution', () => {
  it('extends the deadline when the player looks away but never shortens it', () => {
    const e = enemyAt(2.5, 5.5, 'grunt', {
      committing: true, grantedAt: 0, baseWindup: 1000, deadline: 1400,
      seenAtCommit: false, heardAtCommit: true,
    });
    const s = stateWith([e], { pa: Math.PI, lastGrantAt: 1e9 });
    // Player now faces the enemy: the +400ms must not be clawed back.
    step(s, input(), 0.016, 100, cfg(), rng());
    expect(e.deadline).toBe(1400);
  });
  it('emits a projectile when a ranged wind-up expires, and frees the token', () => {
    const e = enemyAt(8.5, 5.5, 'grunt', {
      committing: true, grantedAt: 0, baseWindup: 100, deadline: 100,
      seenAtCommit: true, heardAtCommit: true,
    });
    const s = stateWith([e], { lastGrantAt: 1e9 });
    step(s, input(), 0.016, 200, cfg({ rangedTokens: 0 }), rng());
    expect(s.projectiles).toHaveLength(1);
    expect(e.committing).toBe(false);
  });
  it('fires blind at the last known position when sight is lost', () => {
    const grid = ['#######', '#.....#', '###.###', '#.....#', '#######'];
    const e = enemyAt(1.5, 3.5, 'grunt', {
      committing: true, grantedAt: 0, baseWindup: 10, deadline: 10,
      lastKnownX: 1.5, lastKnownY: 1.5, seenAtCommit: true, heardAtCommit: false,
    });
    const s = stateWith([e], { grid, px: 5.5, py: 1.5, lastGrantAt: 1e9 });
    step(s, input(), 0.016, 1000, cfg({ rangedTokens: 0 }), rng());
    expect(s.projectiles[0]!.blind).toBe(true);
  });
  it('a melee wind-up that expires in reach kills the player', () => {
    const e = enemyAt(6.0, 5.5, 'rusher', {
      committing: true, grantedAt: 0, baseWindup: 10, deadline: 10,
      seenAtCommit: true, heardAtCommit: true,
    });
    const s = stateWith([e], { lastGrantAt: 1e9 });
    step(s, input(), 0.016, 100, cfg({ meleeTokens: 0 }), rng());
    expect(s.dead).toBe(true);
    expect(s.log.unannounced).toBe(0);
  });
  it('a melee wind-up that expires out of reach whiffs', () => {
    const e = enemyAt(9.5, 5.5, 'rusher', {
      committing: true, grantedAt: 0, baseWindup: 10, deadline: 10,
      seenAtCommit: true, heardAtCommit: true,
    });
    const s = stateWith([e], { lastGrantAt: 1e9 });
    step(s, input(), 0.001, 100, cfg({ meleeTokens: 0 }), rng());
    expect(s.dead).toBe(false);
    expect(e.committing).toBe(false);
  });
});

describe('projectiles', () => {
  const shot = (over: Partial<GameState['projectiles'][number]> = {}): GameState['projectiles'][number] => ({
    x: 8.5, y: 5.5, dx: -1, dy: 0, speed: 9, travelled: 0, maxRange: 14,
    blind: false, sourceSeen: true, sourceHeard: true, ...over,
  });
  it('kills the player on contact', () => {
    const s = stateWith([guard()], { projectiles: [shot({ x: 5.7 })] });
    step(s, input(), 0.05, 100, noCommit(), rng());
    expect(s.dead).toBe(true);
    expect(s.log.seenAtCommit).toBe(1);
  });
  it('expires at max range', () => {
    const s = stateWith([guard()], { projectiles: [shot({ travelled: 13.9, maxRange: 14 })] });
    step(s, input(), 0.05, 100, noCommit(), rng());
    expect(s.projectiles).toHaveLength(0);
  });
  it('is absorbed by a wall', () => {
    const s = stateWith([guard()], { projectiles: [shot({ x: 1.3, dx: -1 })] });
    step(s, input(), 0.05, 100, noCommit(), rng());
    expect(s.projectiles).toHaveLength(0);
  });
  it('keeps travelling when it hits nothing', () => {
    const s = stateWith([guard()], { projectiles: [shot({ x: 9.5, dx: 0, dy: 0 })] });
    step(s, input(), 0.001, 100, noCommit(), rng());
    expect(s.projectiles).toHaveLength(1);
  });
  it('passes harmlessly through a player who is already dead', () => {
    const s = stateWith([guard()], { projectiles: [shot({ x: 5.7 })], dead: true, diedAt: 1e9 });
    step(s, input(), 0.05, 100, noCommit(), rng());
    expect(s.log.deaths).toBe(0);
  });
});

describe('micro-level flow', () => {
  it('advances instantly when the room is clear', () => {
    const s = stateWith([enemyAt(8.5, 5.5, 'grunt', { alive: false })], { levelIndex: 0 });
    s.weapon = 'rifle';
    s.ammo = 2;
    step(s, input(), 0.016, 100, cfg(), rng());
    expect(s.levelIndex).toBe(1);
    expect(s.ammo).toBe(2);
  });
  it('restarts the same level after the respawn delay', () => {
    const s = stateWith([enemyAt(8.5, 5.5)], { levelIndex: 2, dead: true, diedAt: 0 });
    step(s, input(), 0.016, RESPAWN_DELAY_MS + 10, cfg(), rng());
    expect(s.levelIndex).toBe(2);
    expect(s.dead).toBe(false);
  });
  it('waits out the respawn delay before restarting', () => {
    const s = stateWith([enemyAt(8.5, 5.5)], { levelIndex: 2, dead: true, diedAt: 0 });
    step(s, input(), 0.016, 10, cfg(), rng());
    expect(s.dead).toBe(true);
  });
});

describe('the rule C invariant under load', () => {
  it('never records an unannounced death across every priority and inherit rule', () => {
    const rules = ['inFovFirst', 'nearest', 'random'] as const;
    const inherits = ['fresh', 'inheritRemaining'] as const;
    let totalDeaths = 0;
    for (const priority of rules) {
      for (const inherit of inherits) {
        const s = createState(0);
        const r = makeRng(2024);
        const c = cfg({ priority, inherit });
        let now = 0;
        for (let i = 0; i < 60 * 90; i += 1) {
          now += 16.67;
          const live = s.enemies.filter((e) => e.alive);
          const [target] = live;
          if (target !== undefined) {
            // Face roughly away much of the time, to exercise the audio gate.
            s.pa = Math.atan2(target.y - s.py, target.x - s.px) + (r.next() - 0.5) * 2.4;
            s.px += (target.x - s.px) * 0.004;
            s.py += (target.y - s.py) * 0.004;
          }
          step(s, input(), 0.01667, now, c, r);
        }
        totalDeaths += s.log.deaths;
        expect(s.log.unannounced).toBe(0);
      }
    }
    expect(totalDeaths).toBeGreaterThan(0);
  });
});
