import { distanceToPlayer, inFov, isAudible, relativeAngle } from './geometry.js';
import type { Rng } from './rng.js';
import type { Config, Enemy, GameState } from './types.js';

export const heldBy = (state: GameState, melee: boolean): Enemy[] =>
  state.enemies.filter((e) => e.alive && e.committing && e.archetype.melee === melee);

/**
 * The hybrid rule: enemies perceive the player from any angle, but may only
 * COMMIT if the player can see them or is about to hear them. Awareness and
 * commitment are separate gates; conflating them means an enemy only wakes up
 * when you happen to look at it.
 */
export const isEligible = (state: GameState, enemy: Enemy, cfg: Config): boolean => {
  if (!enemy.alive || enemy.committing || !enemy.alerted) {
    return false;
  }
  return inFov(state, enemy, cfg.fovDegrees) || isAudible(state, enemy);
};

export const pickCandidate = (
  state: GameState, candidates: Enemy[], cfg: Config, rng: Rng,
): Enemy | undefined => {
  if (candidates.length === 0) {
    return undefined;
  }
  if (cfg.priority === 'random') {
    return candidates[Math.floor(rng.next() * candidates.length)] ?? candidates[0];
  }
  let pool = candidates;
  if (cfg.priority === 'inFovFirst') {
    // Out-of-view enemies only take a token when nobody in front wants one.
    const seen = candidates.filter((e) => inFov(state, e, cfg.fovDegrees));
    pool = seen.length > 0 ? seen : candidates;
  }
  return pool.reduce((best, e) =>
    distanceToPlayer(state, e) < distanceToPlayer(state, best) ? e : best);
};

/** Taking the token IS the tell: one warning window, never two. */
export const grantToken = (
  state: GameState, enemy: Enemy, now: number, cfg: Config, inheritMs: number | undefined,
): void => {
  const seen = inFov(state, enemy, cfg.fovDegrees);
  const heard = isAudible(state, enemy);
  const base = cfg.inherit === 'inheritRemaining' && inheritMs !== undefined
    ? Math.max(120, inheritMs)
    : cfg.windupMs[enemy.archetype.id];

  enemy.committing = true;
  enemy.grantedAt = now;
  enemy.baseWindup = base;
  enemy.seenAtCommit = seen;
  enemy.heardAtCommit = heard;
  enemy.deadline = now + base + (seen ? 0 : cfg.outOfFovBonusMs);
  state.lastGrantAt = now;

  if (cfg.audioTells) {
    state.cues.push({
      toneHz: enemy.archetype.toneHz,
      pan: Math.sin(relativeAngle(state, enemy)),
      durationMs: seen ? 100 : 160,
      kind: 'commit',
    });
  }
};

/**
 * A flat cap means wildly different pressure at different roster sizes: 2 of
 * twenty is a trickle, 2 of five is half the room. The slope is additive and
 * deliberately branchless — at the default 0 this is arithmetically `base`, so
 * it changes nothing until someone turns it up.
 */
export const tokenCap = (base: number, living: number, perLiving: number): number =>
  Math.max(0, base + Math.floor(living * perLiving));

/** Never let two tells fire on the same frame; the player cannot separate them. */
export const serviceTokens = (
  state: GameState, now: number, cfg: Config, rng: Rng, inheritMs: number | undefined,
): void => {
  if (now - state.lastGrantAt < cfg.grantStaggerMs) {
    return;
  }
  const eligible = (melee: boolean): Enemy[] =>
    state.enemies.filter((e) => isEligible(state, e, cfg) && e.archetype.melee === melee);
  const living = state.enemies.filter((e) => e.alive).length;

  if (heldBy(state, false).length < tokenCap(cfg.rangedTokens, living, cfg.tokensPerLiving)) {
    const pick = pickCandidate(state, eligible(false), cfg, rng);
    if (pick !== undefined) {
      grantToken(state, pick, now, cfg, inheritMs);
      return;
    }
  }
  if (heldBy(state, true).length < tokenCap(cfg.meleeTokens, living, cfg.tokensPerLiving)) {
    const pick = pickCandidate(state, eligible(true), cfg, rng);
    if (pick !== undefined) {
      grantToken(state, pick, now, cfg, inheritMs);
    }
  }
};

/** Remaining wind-up as 0..1, for bars and silhouette state. */
export const windupProgress = (
  enemy: { readonly deadline: number; readonly grantedAt: number }, now: number,
): number => {
  const span = Math.max(1, enemy.deadline - enemy.grantedAt);
  return Math.min(1, Math.max(0, (enemy.deadline - now) / span));
};
