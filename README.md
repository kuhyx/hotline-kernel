# Combat kernel

A first-person, one-hit-kill combat prototype: *Hotline Miami's* loop translated into 3D, with every contested number exposed on a live tuning rig.

This is not a game. It is an instrument for answering one question: **can a first-person, one-hit-kill, aggression-forward game be fair?**

## The problem it exists to test

Hotline Miami's top-down camera hands the player near-total information — every enemy position and patrol route, before committing. That omniscience is what licenses instant death: you always knew, so a death is always your fault. Move to first person and the information collapses, and one-hit-kill stops reading as fair.

Every shipped attempt hits the same wall. The usual escapes are to freeze time (SUPERHOT) or to soften lethality (Severed Steel, Anger Foot). This prototype takes neither. Instead it restores the information contract through four mechanisms, all of them tunable:

1. **Permanent through-wall silhouettes.** Not a pulse, not a scan. Always on, and they turn white the instant an enemy commits.
2. **Commit tokens.** Only a capped number of enemies may be winding up at once, with separate pools for ranged and melee. Crowd size is unbounded; *commitment* is not. The cap may be flat or scale with the living roster, since 2 of twenty and 2 of five are not the same pressure.
3. **Hybrid line of sight.** Enemies perceive the player from any angle, but may only commit if the player can see them **or** hears a distinct spatialised tell. Taking the token *is* the tell — one warning window, never two.
4. **Wind-ups, not softer damage.** Lethality and information are separate knobs. You still die in one hit; you simply always get the tell first.

### The invariant

> Under the hybrid rule, a death announced by **neither** channel must be impossible.

This holds *structurally*, not statistically. `grantToken` snapshots the same two
predicates `isEligible` gates on — `inFov` and `isAudible` — evaluated on the same
tick against the same state, and both death paths carry that snapshot forward. A
death by neither channel is therefore unreachable while the gate is intact. Scale
proves nothing here: a million simulated deaths would say exactly what one says.

A claim that cannot fail is not a claim, so the suite proves the gate is
load-bearing instead of merely asserting the counter is zero:

- **The counter can move.** Two tests bypass `isEligible` and hand a token to an
  enemy it refuses, on the melee and the ranged death path. `unannounced` goes to
  one in each. Broaden the gate so it stops refusing, and both fail.
- **The predicates stay coupled.** A third test scans *every frame* of a live run
  and asserts no token holder ever has both channels false — some 14,000
  holder-frames, against the handful of deaths a death-only check would see.
  Recompute `heard` in `grantToken` against a different radius than `isAudible`
  uses and this fails immediately; the death-based check mostly misses it.

Break either half and a test fails. That is what makes the zero mean something.

One caveat the number does not cover: the snapshot records whether the player
*could* hear, not whether a sound played. With `audio commit tells` switched off,
`grantToken` still records `heardAtCommit`, so a death can book as "heard" with
nothing audible. The toggles measure channel value; the invariant measures the
gate.

## Design rules encoded in the simulation

| Rule | Why |
|---|---|
| A wind-up **always** resolves into a shot | Otherwise an enemy finishes winding behind a wall and kills you with zero tell when you round the corner |
| A wind-up **never** resets on lost line of sight | Otherwise peek → break line of sight → peek is a dominant strategy |
| Deadlines may **extend but never shorten** | Turning to face a threat must not pull death closer than it already was |
| Death frees the token; an interrupted wind-up does not | Killing the committed enemy has to be rewarded, or aggression is punished |
| A freed wind-up waits for the next holder instead of expiring | The kill that frees it almost never lands on a frame that can spend it — the stagger blocks, the cap is still full, nobody is eligible yet. Handing it straight down dropped it, which left `inherits remaining` doing nothing in ~90% of kills |
| An inherited wind-up is floored at 300ms and capped at the fresh window | Inheriting punishes dawdling; it must not manufacture an unanswerable tell. A 5ms remainder off a dying grunt would otherwise hand a hound a 120ms commit — and `unannounced` stays zero throughout, so the fairness log cannot catch this class of unfairness. Only the floor can |
| Grants are staggered ≥150ms | Two identical tells from two directions on one frame cannot be separated |
| Alerted melee enemies emit footsteps that grow louder, and fall silent on commit | A 350ms swing tell from behind is not a fair warning on its own; the approach has to be audible before the commit lands, and a second overlapping channel would break the one-window rule |
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

npm test             # 227 tests
npm run coverage     # enforces 100% lines/branches/functions/statements
npm run lint         # ESLint: every core rule + type-aware strict
npm run typecheck    # tsc --noEmit

npm run soak         # 10 simulated minutes per rule combination, twice over:
                     # once with a passive player, once with one that kills.
                     # Reports the channel mix and the inherited-grant count.
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

The token cap is shared between both pools when it scales. `tokensPerLiving`
adds the same slope to ranged and melee; a roster that wants pressure on one
side only has to move the flat caps instead.

## Licence

MIT.
