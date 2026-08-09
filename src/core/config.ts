import { ARCHETYPES } from './archetypes.js';
import type { ArchetypeId, Config } from './types.js';

export const baseWindups = (): Record<ArchetypeId, number> => ({
  grunt: ARCHETYPES.grunt.windupMs,
  shotgunner: ARCHETYPES.shotgunner.windupMs,
  rifleman: ARCHETYPES.rifleman.windupMs,
  rusher: ARCHETYPES.rusher.windupMs,
  hound: ARCHETYPES.hound.windupMs,
});

export const defaultConfig = (): Config => ({
  windupMs: baseWindups(),
  rangedTokens: 2,
  meleeTokens: 1,
  grantStaggerMs: 150,
  priority: 'inFovFirst',
  inherit: 'fresh',
  outOfFovBonusMs: 400,
  playerSpeed: 4.2,
  fovDegrees: 100,
  comboBreakMs: 3000,
  silhouettes: true,
  threatArcs: true,
  audioTells: true,
});
