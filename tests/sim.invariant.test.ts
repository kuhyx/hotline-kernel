import { describe, expect, it } from 'vitest';
import { ARCHETYPES } from '../src/core/archetypes.js';
import { makeRng } from '../src/core/rng.js';
import { createState, step } from '../src/core/sim.js';
import { grantToken, isEligible } from '../src/core/tokens.js';
import { type PlayerInput, emptyInput } from '../src/core/types.js';
import { cfg, enemyAt, guard, mutableArchetype, noCommit, stateWith } from './helpers.js';

const rng = (): ReturnType<typeof makeRng> => makeRng(11);
const input = (over: Partial<PlayerInput> = {}): PlayerInput => ({ ...emptyInput(), ...over });

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

/**
 * The zero above is guaranteed by construction: `isEligible` gates on
 * `inFov || isAudible`, and `grantToken` snapshots those same two predicates on
 * the same tick. A counter that cannot move is not evidence of anything, so
 * these tests prove the gate is load-bearing rather than merely asserting zero.
 *
 * Two halves, and both must hold:
 *   - bypass the gate by hand and the counter DOES move (unannounced is
 *     reachable, not dead code);
 *   - across thousands of live grants, no token holder ever lacks a channel
 *     (the snapshot predicates still match the gate's).
 */
describe('the rule C invariant is falsifiable', () => {
  it('books an unannounced melee death when the eligibility gate is bypassed', () => {
    // Distance 1.5 is outside the rusher's 1.3 tell radius but inside the
    // range + 0.4 resolution window: unreachable by the gate, lethal anyway.
    const rusher = enemyAt(4, 5.5, 'rusher', { alerted: true });
    const s = stateWith([rusher, guard()], { lastGrantAt: 1e9 });
    const c = noCommit();

    expect(isEligible(s, rusher, c)).toBe(false);

    grantToken(s, rusher, 0, c, undefined);
    expect(rusher.seenAtCommit).toBe(false);
    expect(rusher.heardAtCommit).toBe(false);

    for (let i = 0; i < 120 && !s.dead; i += 1) {
      step(s, input(), 0.01667, 100 + i * 16.67, c, rng());
    }
    expect(s.log.unannounced).toBe(1);
  });

  it('books an unannounced ranged death when the eligibility gate is bypassed', () => {
    // maxRange IS range, and a projectile only has to cover distance - 0.34 to
    // register. Range 2.4 at distance 2.5 clears that comfortably; a naive 1.2
    // at 1.5 would expire in flight and silently pass with unannounced 0.
    const shooter = enemyAt(3, 5.5, 'grunt', { alerted: true });
    shooter.archetype = mutableArchetype(ARCHETYPES.grunt, {
      range: 2.4, melee: false, moveSpeed: 0,
    });
    const s = stateWith([shooter, guard()], { lastGrantAt: 1e9 });
    const c = noCommit();

    expect(isEligible(s, shooter, c)).toBe(false);

    grantToken(s, shooter, 0, c, undefined);
    expect(shooter.seenAtCommit).toBe(false);
    expect(shooter.heardAtCommit).toBe(false);

    for (let i = 0; i < 240 && !s.dead; i += 1) {
      step(s, input(), 0.01667, 100 + i * 16.67, c, rng());
    }
    expect(s.log.unannounced).toBe(1);
  });

  it('never lets an enemy hold a token with both channels false', () => {
    // The coupling guard. Deaths are far too sparse a sample: this checks every
    // holder on every frame, so a snapshot predicate that drifts away from the
    // gate's fails here even when nobody happens to die of it.
    const s = createState(0);
    const r = makeRng(20260807);
    const c = cfg();
    let holders = 0;
    let unannouncedHolders = 0;
    let now = 0;

    for (let i = 0; i < 8000; i += 1) {
      now += 16.67;
      const live = s.enemies
        .filter((e) => e.alive)
        .sort((a, b) =>
          Math.hypot(s.px - a.x, s.py - a.y) - Math.hypot(s.px - b.x, s.py - b.y));
      const [target] = live;
      if (target !== undefined) {
        s.pa = Math.atan2(target.y - s.py, target.x - s.px) + (r.next() - 0.5) * 2.4;
        s.px += (target.x - s.px) * 0.01;
        s.py += (target.y - s.py) * 0.01;
      }
      step(s, input(), 0.01667, now, c, r);
      for (const e of s.enemies) {
        if (e.committing) {
          holders += 1;
          if (!e.seenAtCommit && !e.heardAtCommit) {
            unannouncedHolders += 1;
          }
        }
      }
    }
    expect(holders).toBeGreaterThan(1000);
    expect(unannouncedHolders).toBe(0);
  });
});
