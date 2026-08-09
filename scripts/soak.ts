/**
 * Long-running invariant soak. The unit suite proves the commit gate holds over
 * ~90 simulated seconds per configuration; this runs it far longer, across the
 * full matrix of priority and inherit rules, and reports the channel mix.
 *
 * Run with: npm run soak
 */
import { firePlayerWeapon, lootWeapon, meleePlayer } from '../src/core/combat.js';
import { defaultConfig } from '../src/core/config.js';
import { type Rng, makeRng } from '../src/core/rng.js';
import { createState, loadLevel, step } from '../src/core/sim.js';
import {
  type Config, type GameState, type InheritRule, type PriorityRule, emptyInput,
} from '../src/core/types.js';

const MINUTES = Number(process.argv[2] ?? 10);
const FRAMES = Math.round((MINUTES * 60 * 1000) / 16.67);

const PRIORITIES: readonly PriorityRule[] = ['inFovFirst', 'nearest', 'random'];
const INHERITS: readonly InheritRule[] = ['fresh', 'inheritRemaining'];

interface Tally {
  deaths: number;
  unannounced: number;
  seenOnly: number;
  heardOnly: number;
  both: number;
  kills: number;
  killsWhileCommitting: number;
  levels: number;
  /** Grants that took over a freed wind-up instead of a fresh one. */
  inherited: number;
}

/**
 * The player opens with fists and zero ammo, and firePlayerWeapon returns
 * immediately on fists. So melee is the ONLY way to a first corpse, and looting
 * that corpse is the only way to ammo: melee -> loot -> fire is forced, not a
 * stylistic choice. A fire-only policy leaves the harness as inert as it was
 * while looking like it was fixed.
 */
const actAggressively = (state: GameState, now: number, cfg: Config, rng: Rng): void => {
  lootWeapon(state);
  meleePlayer(state, now, cfg, rng);
  if (state.weapon !== 'fists' && rng.next() < 0.05) {
    firePlayerWeapon(state, now, cfg, rng);
  }
};

/** Runs the policy and books what it killed. Split out to keep `run` simple. */
const actAndTally = (
  state: GameState, now: number, cfg: Config, rng: Rng, tally: Tally,
): void => {
  // Keep the whole room awake, re-applied because a death respawns the roster
  // unalerted. Without this only the single nearest enemy ever wakes: the
  // player kills it before anyone else notices, so a freed wind-up has no
  // candidate and the inherit rule stays invisible. Gunfire is the in-game
  // waker, but ammo only comes off bodies (2-6 rounds) — far too little.
  for (const e of state.enemies) { e.alerted = true; }
  // Sampled before the kill so a committing holder is still committing.
  const committing = state.enemies.filter((e) => e.alive && e.committing);
  const before = state.enemies.filter((e) => e.alive).length;
  actAggressively(state, now, cfg, rng);
  tally.kills += Math.max(0, before - state.enemies.filter((e) => e.alive).length);
  for (const e of committing) {
    if (!e.alive) { tally.killsWhileCommitting += 1; }
  }
};

/** Books the channel mix and whether each new grant inherited a freed window. */
const tallyCommits = (
  state: GameState, cfg: Config, seen: WeakSet<object>, tally: Tally,
): void => {
  for (const enemy of state.enemies) {
    if (enemy.committing && !seen.has(enemy)) {
      seen.add(enemy);
      if (enemy.seenAtCommit && enemy.heardAtCommit) { tally.both += 1; }
      else if (enemy.seenAtCommit) { tally.seenOnly += 1; }
      else if (enemy.heardAtCommit) { tally.heardOnly += 1; }
      // grantToken writes the archetype's own window on the fresh path and
      // max(120, freed) on the inherit path, so a baseWindup that is not the
      // configured one IS an inherited grant. Counted, never inferred.
      if (enemy.baseWindup !== cfg.windupMs[enemy.archetype.id]) {
        tally.inherited += 1;
      }
    }
    if (!enemy.committing) { seen.delete(enemy); }
  }
};

const run = (priority: PriorityRule, inherit: InheritRule, aggressive: boolean): Tally => {
  const state = createState(0);
  const rng = makeRng(20260807);
  // A SECOND stream for aggression decisions, so the passive rows reproduce the
  // old output byte for byte and the sim stream stays comparable across modes.
  const policyRng = makeRng(20260808);
  const cfg = { ...defaultConfig(), priority, inherit };
  if (aggressive) {
    // A roster wider than the cap, so a freed wind-up has somewhere to go.
    // Caps stay at their defaults: the policy must be the only difference
    // between the two blocks, or the channel mixes are not comparable.
    loadLevel(state, 2, 0, 'fists', 0);
  }
  const seen = new WeakSet<object>();
  const tally: Tally = {
    deaths: 0, unannounced: 0, seenOnly: 0, heardOnly: 0, both: 0,
    kills: 0, killsWhileCommitting: 0, levels: 0, inherited: 0,
  };
  let now = 0;
  let { levelIndex } = state;

  for (let i = 0; i < FRAMES; i += 1) {
    now += 16.67;
    // Face the NEAREST threat, not an arbitrary one: facing whoever happens to
    // be first in the array makes every commit read as out-of-view and the
    // channel tally becomes meaningless.
    const live = state.enemies
      .filter((e) => e.alive)
      .sort((a, b) =>
        Math.hypot(state.px - a.x, state.py - a.y) -
        Math.hypot(state.px - b.x, state.py - b.y));
    const [target] = live;
    if (target !== undefined) {
      state.pa = Math.atan2(target.y - state.py, target.x - state.px) +
        (rng.next() - 0.5) * 2.4;
      state.px += (target.x - state.px) * 0.01;
      state.py += (target.y - state.py) * 0.01;
    }
    if (aggressive) {
      actAndTally(state, now, cfg, policyRng, tally);
    }
    step(state, emptyInput(), 0.01667, now, cfg, rng);
    // A fresh level respawns the roster, so only a DROP counts as a kill.
    if (state.levelIndex !== levelIndex) {
      tally.levels += 1;
      ({ levelIndex } = state);
    }
    tallyCommits(state, cfg, seen, tally);
  }
  tally.deaths = state.log.deaths;
  tally.unannounced = state.log.unannounced;
  return tally;
};

let violations = 0;
let deaths = 0;
let inheritedTotal = 0;
process.stdout.write(`soak: ${String(MINUTES)} simulated minutes per configuration\n\n`);
for (const aggressive of [false, true]) {
  for (const priority of PRIORITIES) {
    for (const inherit of INHERITS) {
      const t = run(priority, inherit, aggressive);
      violations += t.unannounced;
      deaths += t.deaths;
      if (aggressive) { inheritedTotal += t.inherited; }
      const body = [
        `deaths ${String(t.deaths).padStart(4)}`,
        `unannounced ${String(t.unannounced).padStart(3)}`,
        `kills ${String(t.kills).padStart(4)}`,
        `onCommit ${String(t.killsWhileCommitting).padStart(3)}`,
        `inherited ${String(t.inherited).padStart(3)}`,
        `seen/heard/both ${String(t.seenOnly)}/${String(t.heardOnly)}/${String(t.both)}`,
      ].join('  ');
      const cols = [
        (aggressive ? 'aggressive' : 'passive').padEnd(11),
        priority.padEnd(11),
        inherit.padEnd(17),
        body,
      ];
      process.stdout.write(`${cols.join('  ')}\n`);
    }
  }
  process.stdout.write('\n');
}

/**
 * Counted, not inferred. `inheritMs` is only defined when the killed enemy was
 * mid-wind-up, so the rule needs the player to kill committed enemies (onCommit
 * above) AND a free eligible enemy to hand the remainder to. If `inherited`
 * stays 0 while onCommit is high, the harness never manufactured the second
 * condition — that is a fact about the rule's reachability, not a broken wire.
 */
const verdict = violations === 0 ? 'INVARIANT HELD' : 'INVARIANT VIOLATED';
process.stdout.write(
  `${String(deaths)} deaths simulated, ${String(violations)} unannounced.\n${verdict}\n`,
);
process.stdout.write(
  inheritedTotal > 0
    ? `inherit rule is live: ${String(inheritedTotal)} grants took over a freed wind-up.\n`
    : 'WARNING: no grant ever inherited a freed wind-up; the rule is untested here.\n',
);
if (violations > 0) { process.exitCode = 1; }
