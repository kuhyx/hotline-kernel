import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng.js';
import {
  grantToken, heldBy, isEligible, pickCandidate, serviceTokens, tokenCap, windupProgress,
} from '../src/core/tokens.js';
import { cfg, enemyAt, stateWith } from './helpers.js';

const rng = (): ReturnType<typeof makeRng> => makeRng(99);

describe('eligibility (the hybrid line-of-sight gate)', () => {
  it('rejects the dead', () => {
    const s = stateWith([enemyAt(8.5, 5.5, 'grunt', { alive: false })]);
    expect(isEligible(s, s.enemies[0]!, cfg())).toBe(false);
  });
  it('rejects an existing token holder', () => {
    const s = stateWith([enemyAt(8.5, 5.5, 'grunt', { committing: true })]);
    expect(isEligible(s, s.enemies[0]!, cfg())).toBe(false);
  });
  it('rejects the unalerted', () => {
    const s = stateWith([enemyAt(8.5, 5.5, 'grunt', { alerted: false })]);
    expect(isEligible(s, s.enemies[0]!, cfg())).toBe(false);
  });
  it('accepts an alerted enemy in view', () => {
    const s = stateWith([enemyAt(8.5, 5.5)]);
    expect(isEligible(s, s.enemies[0]!, cfg())).toBe(true);
  });
  it('accepts an alerted enemy behind the player when it is audible', () => {
    const s = stateWith([enemyAt(2.5, 5.5)]);
    expect(isEligible(s, s.enemies[0]!, cfg())).toBe(true);
  });
  it('rejects an enemy that is neither seen nor heard', () => {
    // A melee archetype behind the player: tell radius 1.3, distance 3.
    const s = stateWith([enemyAt(2.5, 5.5, 'rusher')]);
    expect(isEligible(s, s.enemies[0]!, cfg())).toBe(false);
  });
});

describe('priority rules', () => {
  it('returns nothing from an empty pool', () => {
    const s = stateWith([]);
    expect(pickCandidate(s, [], cfg(), rng())).toBeUndefined();
  });
  it('nearest picks the closest regardless of facing', () => {
    const near = enemyAt(4.5, 5.5);
    const far = enemyAt(9.5, 5.5);
    const s = stateWith([near, far]);
    expect(pickCandidate(s, [far, near], cfg({ priority: 'nearest' }), rng())).toBe(near);
  });
  it('inFovFirst prefers a distant enemy in view over a near one behind', () => {
    const behind = enemyAt(4.5, 5.5);
    const ahead = enemyAt(9.5, 5.5);
    const s = stateWith([behind, ahead]);
    expect(pickCandidate(s, [behind, ahead], cfg({ priority: 'inFovFirst' }), rng())).toBe(ahead);
  });
  it('inFovFirst falls back to everyone when nobody is in view', () => {
    const a = enemyAt(4.5, 5.5);
    const b = enemyAt(2.5, 5.5);
    const s = stateWith([a, b]);
    expect(pickCandidate(s, [a, b], cfg({ priority: 'inFovFirst' }), rng())).toBe(a);
  });
  it('random returns a member of the pool', () => {
    const a = enemyAt(8.5, 5.5);
    const b = enemyAt(9.5, 5.5);
    const s = stateWith([a, b]);
    expect([a, b]).toContain(pickCandidate(s, [a, b], cfg({ priority: 'random' }), rng()));
  });
  it('random falls back to the first element when the draw lands at the end', () => {
    const a = enemyAt(8.5, 5.5);
    const s = stateWith([a]);
    const always1 = { next: (): number => 1 };
    expect(pickCandidate(s, [a], cfg({ priority: 'random' }), always1)).toBe(a);
  });
});

describe('granting', () => {
  it('taking the token is the tell, and raises exactly one cue', () => {
    const s = stateWith([enemyAt(8.5, 5.5)]);
    grantToken(s, s.enemies[0]!, 1000, cfg(), undefined);
    expect(s.cues).toHaveLength(1);
    expect(s.cues[0]!.kind).toBe('commit');
  });
  it('raises no cue when audio tells are disabled', () => {
    const s = stateWith([enemyAt(8.5, 5.5)]);
    grantToken(s, s.enemies[0]!, 1000, cfg({ audioTells: false }), undefined);
    expect(s.cues).toHaveLength(0);
  });
  it('adds the out-of-view bonus only when the player cannot see it', () => {
    const seen = stateWith([enemyAt(8.5, 5.5)]);
    grantToken(seen, seen.enemies[0]!, 0, cfg(), undefined);
    expect(seen.enemies[0]!.deadline).toBe(1000);

    const unseen = stateWith([enemyAt(2.5, 5.5)]);
    grantToken(unseen, unseen.enemies[0]!, 0, cfg(), undefined);
    expect(unseen.enemies[0]!.deadline).toBe(1400);
  });
  it('records the announcement channel at the instant of commit', () => {
    const s = stateWith([enemyAt(8.5, 5.5)]);
    grantToken(s, s.enemies[0]!, 0, cfg(), undefined);
    expect(s.enemies[0]!.seenAtCommit).toBe(true);
    expect(s.enemies[0]!.heardAtCommit).toBe(true);
  });
  it('ignores an inherited window under the fresh rule', () => {
    const s = stateWith([enemyAt(8.5, 5.5)]);
    grantToken(s, s.enemies[0]!, 0, cfg({ inherit: 'fresh' }), 200);
    expect(s.enemies[0]!.baseWindup).toBe(1000);
  });
  it('uses an inherited window under the inherit rule', () => {
    const s = stateWith([enemyAt(8.5, 5.5)]);
    grantToken(s, s.enemies[0]!, 0, cfg({ inherit: 'inheritRemaining' }), 200);
    expect(s.enemies[0]!.baseWindup).toBe(200);
  });
  it('floors an inherited window at 120ms', () => {
    const s = stateWith([enemyAt(8.5, 5.5)]);
    grantToken(s, s.enemies[0]!, 0, cfg({ inherit: 'inheritRemaining' }), 10);
    expect(s.enemies[0]!.baseWindup).toBe(120);
  });
  it('falls back to the base window when inherit has nothing to inherit', () => {
    const s = stateWith([enemyAt(8.5, 5.5)]);
    grantToken(s, s.enemies[0]!, 0, cfg({ inherit: 'inheritRemaining' }), undefined);
    expect(s.enemies[0]!.baseWindup).toBe(1000);
  });
});

describe('servicing', () => {
  it('respects the stagger so two tells never fire together', () => {
    const s = stateWith([enemyAt(8.5, 5.5), enemyAt(8.5, 6.0)], { lastGrantAt: 1000 });
    serviceTokens(s, 1050, cfg({ grantStaggerMs: 150 }), rng(), undefined);
    expect(heldBy(s, false)).toHaveLength(0);
  });
  it('grants once the stagger has elapsed', () => {
    const s = stateWith([enemyAt(8.5, 5.5)], { lastGrantAt: 0 });
    serviceTokens(s, 1000, cfg(), rng(), undefined);
    expect(heldBy(s, false)).toHaveLength(1);
  });
  it('never exceeds the ranged cap', () => {
    const s = stateWith(
      [enemyAt(8.5, 5.0), enemyAt(8.5, 5.5), enemyAt(8.5, 6.0)], { lastGrantAt: -9999 },
    );
    for (let i = 0; i < 10; i += 1) {
      serviceTokens(s, i * 1000, cfg({ rangedTokens: 2 }), rng(), undefined);
    }
    expect(heldBy(s, false)).toHaveLength(2);
  });
  it('uses a separate pool for melee', () => {
    const s = stateWith(
      [enemyAt(6.0, 5.5, 'rusher'), enemyAt(8.5, 5.5, 'grunt')], { lastGrantAt: -9999 },
    );
    for (let i = 0; i < 6; i += 1) {
      serviceTokens(s, i * 1000, cfg(), rng(), undefined);
    }
    expect(heldBy(s, true)).toHaveLength(1);
    expect(heldBy(s, false)).toHaveLength(1);
  });
  it('grants nothing when both caps are zero', () => {
    const s = stateWith([enemyAt(8.5, 5.5), enemyAt(6.0, 5.5, 'rusher')], { lastGrantAt: -9999 });
    serviceTokens(s, 5000, cfg({ rangedTokens: 0, meleeTokens: 0 }), rng(), undefined);
    expect(heldBy(s, false)).toHaveLength(0);
    expect(heldBy(s, true)).toHaveLength(0);
  });
  it('grants nothing when nobody is eligible', () => {
    const s = stateWith([enemyAt(8.5, 5.5, 'grunt', { alerted: false })], { lastGrantAt: -9999 });
    serviceTokens(s, 5000, cfg(), rng(), undefined);
    expect(heldBy(s, false)).toHaveLength(0);
  });
});

describe('windupProgress', () => {
  it('is 1 at the moment of commit and 0 at the deadline', () => {
    const e = { grantedAt: 0, deadline: 1000 };
    expect(windupProgress(e, 0)).toBe(1);
    expect(windupProgress(e, 1000)).toBe(0);
    expect(windupProgress(e, 500)).toBeCloseTo(0.5);
  });
  it('clamps outside the window', () => {
    const e = { grantedAt: 0, deadline: 1000 };
    expect(windupProgress(e, -500)).toBe(1);
    expect(windupProgress(e, 5000)).toBe(0);
  });
  it('survives a degenerate zero-length window', () => {
    expect(windupProgress({ grantedAt: 5, deadline: 5 }, 5)).toBe(0);
  });
});

describe('the token cap scales with the living roster', () => {
  it('is exactly the flat base at the default slope', () => {
    expect(tokenCap(2, 3, 0)).toBe(2);
    expect(tokenCap(0, 5, 0)).toBe(0);
    expect(tokenCap(1, 20, 0)).toBe(1);
  });
  it('adds one token per two living at half slope', () => {
    expect(tokenCap(2, 4, 0.5)).toBe(4);
  });
  it('floors the fraction rather than granting a partial token', () => {
    expect(tokenCap(1, 3, 0.5)).toBe(2);
  });
  it('never returns a negative cap', () => {
    expect(tokenCap(-5, 0, 0)).toBe(0);
  });
  it('counts only the living, so clearing the room lowers the ceiling', () => {
    const s = stateWith([
      enemyAt(8.5, 5.0), enemyAt(8.5, 5.5), enemyAt(8.5, 6.0),
      enemyAt(8.5, 6.5, 'grunt', { alive: false }),
    ], { lastGrantAt: -9999 });
    const c = cfg({ rangedTokens: 1, tokensPerLiving: 0.5 });
    for (let i = 0; i < 10; i += 1) {
      serviceTokens(s, i * 1000, c, rng(), undefined);
    }
    // 3 living * 0.5 = +1 on top of the base 1. The corpse must not count.
    expect(heldBy(s, false)).toHaveLength(2);
  });
  it('lets three commit at once where the flat cap allows only two', () => {
    const enemies = [enemyAt(8.5, 5.0), enemyAt(8.5, 5.5), enemyAt(8.5, 6.0)];
    const flat = stateWith(enemies.map((e) => ({ ...e })), { lastGrantAt: -9999 });
    const scaled = stateWith(enemies.map((e) => ({ ...e })), { lastGrantAt: -9999 });
    for (let i = 0; i < 10; i += 1) {
      serviceTokens(flat, i * 1000, cfg({ rangedTokens: 2 }), rng(), undefined);
      serviceTokens(scaled, i * 1000,
        cfg({ rangedTokens: 2, tokensPerLiving: 0.34 }), rng(), undefined);
    }
    expect(heldBy(flat, false)).toHaveLength(2);
    expect(heldBy(scaled, false)).toHaveLength(3);
  });
});
