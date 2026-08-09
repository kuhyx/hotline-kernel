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

/**
 * The shortest wind-up a player can actually answer. The fastest archetype
 * (hound, 350ms) sits above it by design; nothing inherited may go below it.
 */
const MIN_REACTION_MS = 300;

/** Taking the token IS the tell: one warning window, never two. */
export const grantToken = (
  state: GameState, enemy: Enemy, now: number, cfg: Config, inheritMs: number | undefined,
): void => {
  const seen = inFov(state, enemy, cfg.fovDegrees);
  const heard = isAudible(state, enemy);
  const fresh = cfg.windupMs[enemy.archetype.id];
  /**
   * An inherited window never exceeds the fresh one and never drops below the
   * reaction floor. Inheriting is meant to punish dawdling, not to manufacture
   * an unanswerable tell: a 5ms remainder off a dying grunt used to hand a
   * hound a 120ms commit. The floor is absolute, not a fraction of the fresh
   * window — a third of an already-fast 350ms is still too short to answer.
   * `unannounced` stays zero through all of it, so the log cannot catch this
   * class of unfairness; only the floor can.
   */
  const base = cfg.inherit === 'inheritRemaining' && inheritMs !== undefined
    ? Math.min(fresh, Math.max(MIN_REACTION_MS, inheritMs))
    : fresh;

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
      gain: 0.14,
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
  // Park a freed window before any early return. The kill that frees it almost
  // never coincides with a grant that can use it — the stagger blocks, the cap
  // is still full, nobody is eligible yet — so handing it straight down loses
  // it. Keep the LARGEST outstanding debt rather than the first: two kills in
  // quick succession should not let a 0ms remainder mask a 900ms one, and `0`
  // is not nullish so `??=` would have done exactly that.
  if (inheritMs !== undefined) {
    state.pendingInheritMs = Math.max(state.pendingInheritMs ?? 0, inheritMs);
  }
  // Only the inherit rule has any use for a parked window. Holding one under
  // `fresh` means a later flip of the live Rig toggle would apply a debt
  // incurred while the rule was off.
  if (cfg.inherit !== 'inheritRemaining') {
    state.pendingInheritMs = undefined;
  }

  if (now - state.lastGrantAt < cfg.grantStaggerMs) {
    return;
  }
  const eligible = (melee: boolean): Enemy[] =>
    state.enemies.filter((e) => isEligible(state, e, cfg) && e.archetype.melee === melee);
  const living = state.enemies.filter((e) => e.alive).length;
  const pending = state.pendingInheritMs;
  const consume = (pick: Enemy): void => {
    grantToken(state, pick, now, cfg, pending);
    state.pendingInheritMs = undefined;
  };

  if (heldBy(state, false).length < tokenCap(cfg.rangedTokens, living, cfg.tokensPerLiving)) {
    const pick = pickCandidate(state, eligible(false), cfg, rng);
    if (pick !== undefined) {
      consume(pick);
      return;
    }
  }
  if (heldBy(state, true).length < tokenCap(cfg.meleeTokens, living, cfg.tokensPerLiving)) {
    const pick = pickCandidate(state, eligible(true), cfg, rng);
    if (pick !== undefined) {
      consume(pick);
    }
  }
};

/** Beyond this an approach is not yet news; inside it, it is the warning. */
const FOOTSTEP_RADIUS = 9;
/** A walking pace, and clear of the hound's 350ms wind-up. */
const FOOTSTEP_CADENCE_MS = 320;
const FOOTSTEP_QUIET = 0.05;
const FOOTSTEP_SWING = 0.13;

/**
 * A 350ms swing tell from behind is not a fair warning on its own. Footsteps
 * that grow louder land BEFORE the commit does, so the approach is announced
 * even when the swing itself is too fast to answer.
 *
 * Deliberately silent once the enemy commits: taking the token is its own tell,
 * and a second overlapping channel is the "never two warnings" rule broken.
 */
export const wantsFootstep = (
  state: GameState, enemy: Enemy, now: number, cfg: Config,
): boolean =>
  cfg.audioTells &&
  enemy.archetype.melee &&
  enemy.alerted &&
  !enemy.committing &&
  distanceToPlayer(state, enemy) < FOOTSTEP_RADIUS &&
  now - enemy.lastFootstepAt >= FOOTSTEP_CADENCE_MS;

/** Closer is louder: the gain IS the distance cue. */
export const emitFootstep = (state: GameState, enemy: Enemy, now: number): void => {
  const nearness = 1 - Math.min(1, distanceToPlayer(state, enemy) / FOOTSTEP_RADIUS);
  enemy.lastFootstepAt = now;
  state.cues.push({
    toneHz: enemy.archetype.toneHz * 0.5,
    pan: Math.sin(relativeAngle(state, enemy)),
    durationMs: 70,
    kind: 'footstep',
    gain: FOOTSTEP_QUIET + FOOTSTEP_SWING * nearness,
  });
};

/** Remaining wind-up as 0..1, for bars and silhouette state. */
export const windupProgress = (
  enemy: { readonly deadline: number; readonly grantedAt: number }, now: number,
): number => {
  const span = Math.max(1, enemy.deadline - enemy.grantedAt);
  return Math.min(1, Math.max(0, (enemy.deadline - now) / span));
};
