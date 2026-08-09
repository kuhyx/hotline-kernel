# Combat kernel

A first-person, one-hit-kill combat prototype: *Hotline Miami's* loop translated into 3D, with every contested number exposed on a live tuning rig.

This is not a game. It is an instrument for answering one question: **can a first-person, one-hit-kill, aggression-forward game be fair?**

## The problem it exists to test

Hotline Miami's top-down camera hands the player near-total information — every enemy position and patrol route, before committing. That omniscience is what licenses instant death: you always knew, so a death is always your fault. Move to first person and the information collapses, and one-hit-kill stops reading as fair.

Every shipped attempt hits the same wall. The usual escapes are to freeze time (SUPERHOT) or to soften lethality (Severed Steel, Anger Foot). This prototype takes neither. Instead it restores the information contract through four mechanisms, all of them tunable:

1. **Permanent through-wall silhouettes.** Not a pulse, not a scan. Always on, and they turn white the instant an enemy commits.
2. **Commit tokens.** Only a capped number of enemies may be winding up at once, with separate pools for ranged and melee. Crowd size is unbounded; *commitment* is not.
3. **Hybrid line of sight.** Enemies perceive the player from any angle, but may only commit if the player can see them **or** hears a distinct spatialised tell. Taking the token *is* the tell — one warning window, never two.
4. **Wind-ups, not softer damage.** Lethality and information are separate knobs. You still die in one hit; you simply always get the tell first.

### The invariant

> Under the hybrid rule, a death announced by **neither** channel must be impossible.

That number is on the rig, and it is asserted in the test suite across every priority and inherit rule. If it ever leaves zero, the commit gate is broken — and no amount of wind-up tuning will fix it.

## Design rules encoded in the simulation

| Rule | Why |
|---|---|
| A wind-up **always** resolves into a shot | Otherwise an enemy finishes winding behind a wall and kills you with zero tell when you round the corner |
| A wind-up **never** resets on lost line of sight | Otherwise peek → break line of sight → peek is a dominant strategy |
| Deadlines may **extend but never shorten** | Turning to face a threat must not pull death closer than it already was |
| Death frees the token; an interrupted wind-up does not | Killing the committed enemy has to be rewarded, or aggression is punished |
| Grants are staggered ≥150ms | Two identical tells from two directions on one frame cannot be separated |
| Tell radius **is** weapon range | Split them and an enemy can shoot from somewhere it cannot announce itself |
| Alerted enemies advance and flank | Breaking line of sight drags the room onto you instead of buying safety |
| Gunfire alerts; melee is silent | Range costs tempo instead of buying safety |
| Ammo comes only off bodies | The gun that lets you camp is the gun that runs dry |
| The chain carries across micro-levels, breaking only on death | Cheap to retry, expensive to be ambitious |

## Architecture

```
src/core/     pure, deterministic, zero DOM — the whole simulation
src/render/   raycaster drawing against an injectable 2D context
src/ui/       React shell, hooks, audio, and the snapshot boundary
```

The simulation is **mutable by design** — it runs every frame and allocating a
fresh world per tick would be waste. React's model is the opposite. The two meet
at `src/ui/rigView.ts`: the world lives behind a ref and is never read during
render; each frame publishes a small immutable snapshot for the rig.

Randomness is seeded (`src/core/rng.ts`), so every run is reproducible and even
the `random` priority rule is testable.

## Commands

```bash
npm install

npm run dev          # http://localhost:5173
npm run build        # typecheck + production bundle into dist/
npm run preview      # serve the built bundle

npm test             # 193 tests
npm run coverage     # enforces 100% lines/branches/functions/statements
npm run lint         # ESLint: every core rule + type-aware strict
npm run typecheck    # tsc --noEmit

npm run soak         # 10 simulated minutes per rule combination
npm run soak -- 30   # longer

npm run verify       # typecheck + lint + coverage + build
```

### Controls

`W A S D` move · mouse look · `←` `→` turn (fallback if pointer lock is refused)
`click` or `Space` fire · `V` melee · `E` take a weapon off a body

## Toolchain notes

- **TypeScript is pinned to 6.0.3, not 7.x.** `typescript-eslint@8.66` caps at `<6.1.0`, and type-aware linting is where the strict rules live, so it won over the newer compiler. Revisit when typescript-eslint supports 7.
- **ESLint runs `js.configs.all`** plus `strictTypeChecked` and `stylisticTypeChecked`. Roughly ten rules are disabled, each with a written justification at the disable site — including two pairs that contradict each other outright (`init-declarations` vs `no-undef-init`).
- **Coverage excludes only `*.d.ts`**, which contain no executable code. Nothing else is excluded to reach the number.

## What is deliberately missing

No verticality — the renderer is a raycaster, so the world is a floor plan. The
design banned tight corridors anyway, but stairs and mezzanines are off the table
without a real 3D renderer.

Melee has no continuous approach audio yet. A 350ms swing tell from behind is not
a fair warning on its own; footsteps that grow louder should land before the
commit does.

The token cap is flat. Against a roster of twenty, a cap of 2 is light pressure;
against a roster of five it is half the room committing at once. It probably
wants to scale with the number of living enemies.

## Licence

MIT.
