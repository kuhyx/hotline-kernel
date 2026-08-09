import { ARCHETYPES } from './archetypes.js';
import { killPlayer } from './combat.js';
import { clearRay, distanceToPlayer, inFov, isSolid } from './geometry.js';
import { levelAt } from './levels.js';
import type { Rng } from './rng.js';
import { emitFootstep, serviceTokens, wantsFootstep } from './tokens.js';
import type { Config, Enemy, GameState, PlayerInput, WeaponId } from './types.js';

export const RESPAWN_DELAY_MS = 380;

const emptyLog = (): GameState['log'] => ({
  deaths: 0, seenAtCommit: 0, heardAtCommit: 0, unannounced: 0, survivalMs: [],
});

export const loadLevel = (
  state: GameState, index: number, now: number, weapon: WeaponId, ammo: number,
): void => {
  const level = levelAt(index);
  state.levelIndex = index;
  state.grid = level.grid;
  state.px = level.px;
  state.py = level.py;
  state.pa = level.pa;
  state.weapon = weapon;
  state.ammo = ammo;
  state.projectiles = [];
  state.lastGrantAt = now;
  state.levelStartedAt = now;
  // A new level is a new fight; a window freed in the last one means nothing.
  state.pendingInheritMs = undefined;
  state.dead = false;
  state.diedAt = 0;
  state.enemies = level.spawns.map((sp): Enemy => ({
    x: sp.x, y: sp.y, archetype: ARCHETYPES[sp.archetype], alive: true,
    alerted: false, committing: false, grantedAt: 0, deadline: 0, baseWindup: 0,
    seenAtCommit: false, heardAtCommit: false, lastKnownX: sp.x, lastKnownY: sp.y,
    looted: false, lastFootstepAt: -Infinity,
  }));
};

export const createState = (now: number): GameState => {
  const state: GameState = {
    levelIndex: 0, grid: [], px: 0, py: 0, pa: 0, weapon: 'fists', ammo: 0,
    enemies: [], projectiles: [], combo: 0, bestCombo: 0, score: 0,
    lastKillAt: now, lastGrantAt: now, levelStartedAt: now, dead: false,
    pendingInheritMs: undefined,
    diedAt: 0, log: emptyLog(), cues: [],
  };
  loadLevel(state, 0, now, 'fists', 0);
  return state;
};

const moveVector = (state: GameState, input: PlayerInput): { mx: number; my: number } => {
  const fx = Math.cos(state.pa);
  const fy = Math.sin(state.pa);
  let mx = 0;
  let my = 0;
  if (input.forward) { mx += fx; my += fy; }
  if (input.back) { mx -= fx; my -= fy; }
  if (input.left) { mx += fy; my -= fx; }
  if (input.right) { mx -= fy; my += fx; }
  return { mx, my };
};

const movePlayer = (state: GameState, input: PlayerInput, dt: number, cfg: Config): void => {
  const { mx, my } = moveVector(state, input);
  const len = Math.hypot(mx, my);
  if (len > 0) {
    const sx = (mx / len) * cfg.playerSpeed * dt;
    const sy = (my / len) * cfg.playerSpeed * dt;
    if (!isSolid(state.grid, state.px + sx * 1.6, state.py)) { state.px += sx; }
    if (!isSolid(state.grid, state.px, state.py + sy * 1.6)) { state.py += sy; }
  }
  if (input.turnLeft) { state.pa -= 2.4 * dt; }
  if (input.turnRight) { state.pa += 2.4 * dt; }
};

/**
 * Awareness is enemy-side: they can notice your back. Only committing is gated
 * by your field of view or the audio tell.
 */
const updateAwareness = (state: GameState, enemy: Enemy): void => {
  if (enemy.alerted) {
    return;
  }
  const perception = Math.max(enemy.archetype.range, 12);
  if (distanceToPlayer(state, enemy) < perception &&
      clearRay(state.grid, enemy.x, enemy.y, state.px, state.py)) {
    enemy.alerted = true;
  }
};

/** Alerted enemies never hold position: breaking line of sight drags the room onto you. */
const advance = (state: GameState, enemy: Enemy, dt: number): void => {
  if (!enemy.alerted) {
    return;
  }
  const dx = state.px - enemy.x;
  const dy = state.py - enemy.y;
  const d = Math.hypot(dx, dy) || 1;
  const want = enemy.archetype.melee ? 0.7 : enemy.archetype.range * 0.62;
  const dir = d > want ? 1 : -0.6;
  let sx = (dx / d) * enemy.archetype.moveSpeed * dir * dt;
  let sy = (dy / d) * enemy.archetype.moveSpeed * dir * dt;
  if (!enemy.archetype.melee) {
    sx += (-dy / d) * enemy.archetype.moveSpeed * 0.35 * dt;
    sy += (dx / d) * enemy.archetype.moveSpeed * 0.35 * dt;
  }
  if (!isSolid(state.grid, enemy.x + sx * 1.4, enemy.y)) { enemy.x += sx; }
  if (!isSolid(state.grid, enemy.x, enemy.y + sy * 1.4)) { enemy.y += sy; }
};

const resolveCommit = (
  state: GameState, enemy: Enemy, now: number, cfg: Config, rng: Rng,
): void => {
  // The deadline may extend but never shorten: turning to face a threat must
  // not pull death closer than it already was.
  const target = enemy.grantedAt + enemy.baseWindup +
    (inFov(state, enemy, cfg.fovDegrees) ? 0 : cfg.outOfFovBonusMs);
  enemy.deadline = Math.max(enemy.deadline, target);
  enemy.lastKnownX = state.px;
  enemy.lastKnownY = state.py;
  if (now < enemy.deadline) {
    return;
  }
  // A wind-up ALWAYS resolves into a shot. No enemy may hold a wound state.
  if (enemy.archetype.melee) {
    if (distanceToPlayer(state, enemy) < enemy.archetype.range + 0.4) {
      killPlayer(state, enemy.seenAtCommit, enemy.heardAtCommit, now);
    }
  } else {
    const vx = enemy.lastKnownX - enemy.x;
    const vy = enemy.lastKnownY - enemy.y;
    const len = Math.hypot(vx, vy) || 1;
    state.projectiles.push({
      x: enemy.x, y: enemy.y, dx: vx / len, dy: vy / len,
      speed: enemy.archetype.projectileSpeed, travelled: 0,
      maxRange: enemy.archetype.range,
      blind: !clearRay(state.grid, enemy.x, enemy.y, state.px, state.py),
      sourceSeen: enemy.seenAtCommit, sourceHeard: enemy.heardAtCommit,
    });
  }
  enemy.committing = false;
  serviceTokens(state, now, cfg, rng, undefined);
};

/** Finite speed with a hard max range: distance is what buys a dodge. */
const stepProjectiles = (state: GameState, dt: number, now: number): void => {
  const surviving: GameState['projectiles'] = [];
  for (const p of state.projectiles) {
    const advanceBy = p.speed * dt;
    const nx = p.x + p.dx * advanceBy;
    const ny = p.y + p.dy * advanceBy;
    p.travelled += advanceBy;
    const stopped = isSolid(state.grid, nx, ny) || p.travelled > p.maxRange;
    if (!stopped) {
      p.x = nx;
      p.y = ny;
      const struck = !state.dead &&
        Math.hypot(state.px - p.x, state.py - p.y) < 0.34;
      if (struck) {
        killPlayer(state, p.sourceSeen, p.sourceHeard, now);
      } else {
        surviving.push(p);
      }
    }
  }
  state.projectiles = surviving;
};

/** Micro-levels: no menu, no score card, straight into the next spawn. */
const advanceFlow = (state: GameState, now: number): void => {
  if (!state.dead && state.enemies.every((e) => !e.alive)) {
    loadLevel(state, state.levelIndex + 1, now, state.weapon, state.ammo);
    return;
  }
  if (state.dead && now - state.diedAt > RESPAWN_DELAY_MS) {
    loadLevel(state, state.levelIndex, now, state.weapon, state.ammo);
  }
};

export const step = (
  state: GameState, input: PlayerInput, dt: number, now: number, cfg: Config, rng: Rng,
): void => {
  if (!state.dead) {
    movePlayer(state, input, dt, cfg);
  }
  if (state.combo > 0 && now - state.lastKillAt > cfg.comboBreakMs) {
    state.combo = 0;
  }
  for (const enemy of state.enemies.filter((e) => e.alive)) {
    updateAwareness(state, enemy);
    advance(state, enemy, dt);
    if (wantsFootstep(state, enemy, now, cfg)) {
      emitFootstep(state, enemy, now);
    }
    if (enemy.committing) {
      resolveCommit(state, enemy, now, cfg, rng);
    }
  }
  stepProjectiles(state, dt, now);
  if (!state.dead) {
    serviceTokens(state, now, cfg, rng, undefined);
  }
  advanceFlow(state, now);
};
