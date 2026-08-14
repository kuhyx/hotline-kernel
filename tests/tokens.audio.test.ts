import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng.js';
import { step } from '../src/core/sim.js';
import { emitFootstep, heldBy, serviceTokens, tokenCap, wantsFootstep } from '../src/core/tokens.js';
import { type Enemy, emptyInput } from '../src/core/types.js';
import { cfg, enemyAt, guard, noCommit, stateWith } from './helpers.js';

const rng = (): ReturnType<typeof makeRng> => makeRng(99);

describe('melee approach audio', () => {
  /** A rusher two steps away, alerted, not yet committing: the baseline case. */
  const approaching = (over: Partial<Enemy> = {}): Enemy =>
    enemyAt(7.5, 5.5, 'rusher', { alerted: true, ...over });

  it('announces an alerted melee enemy closing in', () => {
    const e = approaching();
    const s = stateWith([e]);
    expect(wantsFootstep(s, e, 0, cfg())).toBe(true);
  });
  it('stays silent for ranged archetypes, whose range is their tell', () => {
    const e = enemyAt(7.5, 5.5, 'grunt', { alerted: true });
    expect(wantsFootstep(stateWith([e]), e, 0, cfg())).toBe(false);
  });
  it('stays silent while the enemy has not noticed the player', () => {
    const e = approaching({ alerted: false });
    expect(wantsFootstep(stateWith([e]), e, 0, cfg())).toBe(false);
  });
  it('stays silent once committed: the token is its own tell, never two', () => {
    const e = approaching({ committing: true });
    expect(wantsFootstep(stateWith([e]), e, 0, cfg())).toBe(false);
  });
  it('stays silent when audio tells are switched off', () => {
    const e = approaching();
    expect(wantsFootstep(stateWith([e]), e, 0, cfg({ audioTells: false }))).toBe(false);
  });
  it('stays silent beyond the approach radius', () => {
    // Player sits at 5.5; 9 units is the edge, so 20 is comfortably outside.
    const e = enemyAt(20, 5.5, 'rusher', { alerted: true });
    expect(wantsFootstep(stateWith([e]), e, 0, cfg())).toBe(false);
  });
  it('holds the cadence, then steps again', () => {
    const e = approaching({ lastFootstepAt: 1000 });
    const s = stateWith([e]);
    expect(wantsFootstep(s, e, 1100, cfg())).toBe(false);
    expect(wantsFootstep(s, e, 1400, cfg())).toBe(true);
  });
  it('grows louder as the enemy closes', () => {
    const far = approaching();
    const sFar = stateWith([far]);
    emitFootstep(sFar, far, 0);
    const near = approaching();
    near.x = 6.0;
    const sNear = stateWith([near]);
    emitFootstep(sNear, near, 0);
    expect(sNear.cues[0]!.gain).toBeGreaterThan(sFar.cues[0]!.gain);
  });
  it('pans to the side the enemy is on', () => {
    const right = approaching();
    right.x = 5.5;
    right.y = 8.5;
    const s = stateWith([right]);
    emitFootstep(s, right, 0);
    expect(s.cues[0]!.pan).toBeGreaterThan(0);
  });
  it('records the step so the cadence can be measured from it', () => {
    const e = approaching();
    const s = stateWith([e]);
    emitFootstep(s, e, 4200);
    expect(e.lastFootstepAt).toBe(4200);
    expect(s.cues[0]!.kind).toBe('footstep');
  });
  it('lands before the commit does, through a real sim step', () => {
    const e = approaching();
    const s = stateWith([e, guard()], { lastGrantAt: 1e9 });
    step(s, emptyInput(), 0.01667, 500, noCommit(), rng());
    expect(s.cues.some((c) => c.kind === 'footstep')).toBe(true);
    expect(s.cues.some((c) => c.kind === 'commit')).toBe(false);
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
