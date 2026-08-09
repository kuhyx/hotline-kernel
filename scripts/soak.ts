/**
 * Long-running invariant soak. The unit suite proves the commit gate holds over
 * ~90 simulated seconds per configuration; this runs it far longer, across the
 * full matrix of priority and inherit rules, and reports the channel mix.
 *
 * Run with: npm run soak
 */
import { defaultConfig } from '../src/core/config.js';
import { makeRng } from '../src/core/rng.js';
import { createState, step } from '../src/core/sim.js';
import { type InheritRule, type PriorityRule, emptyInput } from '../src/core/types.js';

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
}

const run = (priority: PriorityRule, inherit: InheritRule): Tally => {
  const state = createState(0);
  const rng = makeRng(20260807);
  const cfg = { ...defaultConfig(), priority, inherit };
  const seen = new WeakSet<object>();
  const tally: Tally = { deaths: 0, unannounced: 0, seenOnly: 0, heardOnly: 0, both: 0 };
  let now = 0;

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
    step(state, emptyInput(), 0.01667, now, cfg, rng);
    for (const enemy of state.enemies) {
      if (enemy.committing && !seen.has(enemy)) {
        seen.add(enemy);
        if (enemy.seenAtCommit && enemy.heardAtCommit) { tally.both += 1; }
        else if (enemy.seenAtCommit) { tally.seenOnly += 1; }
        else if (enemy.heardAtCommit) { tally.heardOnly += 1; }
      }
      if (!enemy.committing) { seen.delete(enemy); }
    }
  }
  tally.deaths = state.log.deaths;
  tally.unannounced = state.log.unannounced;
  return tally;
};

let violations = 0;
let deaths = 0;
process.stdout.write(`soak: ${String(MINUTES)} simulated minutes per configuration\n\n`);
for (const priority of PRIORITIES) {
  for (const inherit of INHERITS) {
    const t = run(priority, inherit);
    violations += t.unannounced;
    deaths += t.deaths;
    const cols = [
      priority.padEnd(11),
      inherit.padEnd(17),
      `deaths ${String(t.deaths).padStart(4)}`,
      `unannounced ${String(t.unannounced).padStart(3)}`,
      `commits seen/heard/both ${String(t.seenOnly)}/${String(t.heardOnly)}/${String(t.both)}`,
    ];
    process.stdout.write(`${cols.join('  ')}\n`);
  }
}
const verdict = violations === 0 ? 'INVARIANT HELD' : 'INVARIANT VIOLATED';
process.stdout.write(
  `\n${String(deaths)} deaths simulated, ${String(violations)} unannounced.\n${verdict}\n`,
);
if (violations > 0) { process.exitCode = 1; }
