/** Shared domain types for the combat kernel. */

export type ArchetypeId = 'grunt' | 'shotgunner' | 'rifleman' | 'rusher' | 'hound';

export type PriorityRule = 'inFovFirst' | 'nearest' | 'random';

export type InheritRule = 'fresh' | 'inheritRemaining';

export type WeaponId = 'fists' | 'pistol' | 'shotgun' | 'rifle';

export interface Archetype {
  readonly id: ArchetypeId;
  readonly label: string;
  /** Base commit window in milliseconds. */
  readonly windupMs: number;
  /** Weapon reach. Doubles as the tell radius: one number, never two. */
  readonly range: number;
  readonly projectileSpeed: number;
  readonly moveSpeed: number;
  readonly melee: boolean;
  readonly magazine: number;
  readonly toneHz: number;
  readonly colour: string;
  readonly drops: WeaponId;
}

export interface Enemy {
  x: number;
  y: number;
  archetype: Archetype;
  alive: boolean;
  alerted: boolean;
  /** Holds a commit token: is actively winding up. */
  committing: boolean;
  grantedAt: number;
  deadline: number;
  baseWindup: number;
  /** Whether the player could see / hear it at the instant it committed. */
  seenAtCommit: boolean;
  heardAtCommit: boolean;
  lastKnownX: number;
  lastKnownY: number;
  looted: boolean;
  /** Per-enemy, so two approaching threats each announce themselves. */
  lastFootstepAt: number;
}

export interface Projectile {
  x: number;
  y: number;
  dx: number;
  dy: number;
  speed: number;
  travelled: number;
  maxRange: number;
  blind: boolean;
  sourceSeen: boolean;
  sourceHeard: boolean;
}

export interface Config {
  /** Live, tunable wind-up per archetype. The archetype table stays frozen. */
  windupMs: Record<ArchetypeId, number>;
  rangedTokens: number;
  meleeTokens: number;
  /**
   * Extra commit tokens per living enemy, added to both caps. A flat cap is
   * light pressure against a roster of twenty and half the room against five.
   * Default 0 reproduces the flat behaviour exactly, so this is opt-in.
   * One shared slope, not one per pool: per-pool is the obvious extension if
   * tuning ever demands it.
   */
  tokensPerLiving: number;
  grantStaggerMs: number;
  priority: PriorityRule;
  inherit: InheritRule;
  outOfFovBonusMs: number;
  playerSpeed: number;
  fovDegrees: number;
  comboBreakMs: number;
  silhouettes: boolean;
  threatArcs: boolean;
  audioTells: boolean;
}

export interface FairnessLog {
  deaths: number;
  seenAtCommit: number;
  heardAtCommit: number;
  /** Rule C invariant: this must never leave zero. */
  unannounced: number;
  survivalMs: number[];
}

export interface PlayerInput {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  turnLeft: boolean;
  turnRight: boolean;
}

export type CueKind =
  'commit' | 'shot' | 'kill' | 'death' | 'dryFire' | 'pickup' | 'footstep';

export interface Cue {
  toneHz: number;
  pan: number;
  durationMs: number;
  kind: CueKind;
  /**
   * Peak amplitude, 0..1. Required rather than optional: a `?? default` would
   * be a branch, and every branch here has to be paid for in tests.
   * Proximity is the whole signal of the melee approach tell.
   */
  gain: number;
}

export interface GameState {
  levelIndex: number;
  grid: readonly string[];
  px: number;
  py: number;
  pa: number;
  weapon: WeaponId;
  ammo: number;
  enemies: Enemy[];
  projectiles: Projectile[];
  combo: number;
  bestCombo: number;
  score: number;
  lastKillAt: number;
  lastGrantAt: number;
  levelStartedAt: number;
  dead: boolean;
  diedAt: number;
  log: FairnessLog;
  /** Audio events raised this step; the UI drains them. */
  cues: Cue[];
}

export const emptyInput = (): PlayerInput => ({
  forward: false,
  back: false,
  left: false,
  right: false,
  turnLeft: false,
  turnRight: false,
});
