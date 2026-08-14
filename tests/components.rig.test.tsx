import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultConfig } from '../src/core/config.js';
import { createState, loadLevel } from '../src/core/sim.js';
import { buildRigView } from '../src/ui/rigView.js';
import { Rig } from '../src/ui/Rig.js';
import type { Config, GameState } from '../src/core/types.js';

afterEach(() => { vi.restoreAllMocks(); });

describe('Rig', () => {
  const renderRig = (state: GameState, config: Config = defaultConfig()) => {
    const onConfig = vi.fn();
    const onReset = vi.fn();
    render(
      <Rig view={buildRigView(state, 500)} config={config}
        onConfig={onConfig} onReset={onReset} />,
    );
    return { onConfig, onReset };
  };

  it('shows empty token slots on a fresh run', () => {
    renderRig(createState(0));
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('shows the holder in a token slot', () => {
    const state = createState(0);
    const first = state.enemies[0]!;
    first.committing = true;
    first.grantedAt = 0;
    first.deadline = 1000;
    renderRig(state);
    expect(screen.getAllByText(first.archetype.label).length).toBeGreaterThan(0);
  });

  it('renders a third ranged slot when the scaled cap grants one', () => {
    // Level 1 is the first with three ranged spawns; level 0 has only two.
    const state = createState(0);
    loadLevel(state, 1, 0, 'fists', 0);
    const ranged = state.enemies.filter((e) => !e.archetype.melee).slice(0, 3);
    expect(ranged).toHaveLength(3);
    for (const [i, e] of ranged.entries()) {
      e.committing = true;
      e.grantedAt = 0;
      e.deadline = 1000 + i;
    }
    renderRig(state);
    // Hardcoded RANGED 1/2 rows would drop the third holder silently.
    expect(screen.getByText('RANGED 3')).toBeTruthy();
  });

  it('reports no deaths yet', () => {
    renderRig(createState(0));
    expect(screen.getByText(/must stay at zero/)).toBeTruthy();
    expect(screen.getByText('—', { selector: 'td.n' })).toBeTruthy();
  });

  it('reports the gate holding once deaths exist but none were unannounced', () => {
    const state = createState(0);
    state.log = { deaths: 3, seenAtCommit: 3, heardAtCommit: 1, unannounced: 0, survivalMs: [1000, 3000] };
    renderRig(state);
    expect(screen.getByText(/Gate holding/)).toBeTruthy();
    expect(screen.getByText('3.0s')).toBeTruthy();
  });

  it('flags a leaking gate', () => {
    const state = createState(0);
    state.log = { deaths: 2, seenAtCommit: 1, heardAtCommit: 0, unannounced: 1, survivalMs: [500] };
    renderRig(state);
    expect(screen.getByText(/Fix the gate before touching wind-up/)).toBeTruthy();
  });

  it('reports a numeric config change', () => {
    const { onConfig } = renderRig(createState(0));
    fireEvent.change(screen.getByLabelText('ranged token cap'), { target: { value: '3' } });
    expect(onConfig).toHaveBeenCalledWith('rangedTokens', 3);
  });

  it('reports a priority change', () => {
    const { onConfig } = renderRig(createState(0));
    fireEvent.change(screen.getByLabelText('priority'), { target: { value: 'nearest' } });
    expect(onConfig).toHaveBeenCalledWith('priority', 'nearest');
  });

  it('reports an inherit-rule change', () => {
    const { onConfig } = renderRig(createState(0));
    fireEvent.change(screen.getByLabelText('on kill, next holder'), { target: { value: 'inheritRemaining' } });
    expect(onConfig).toHaveBeenCalledWith('inherit', 'inheritRemaining');
  });

  it('reports a toggled information channel', () => {
    const { onConfig } = renderRig(createState(0));
    fireEvent.click(screen.getByLabelText('through-wall silhouettes'));
    expect(onConfig).toHaveBeenCalledWith('silhouettes', false);
  });

  it('reports a wind-up change per archetype', () => {
    const { onConfig } = renderRig(createState(0));
    fireEvent.change(screen.getByLabelText('rifleman'), { target: { value: '900' } });
    expect(onConfig).toHaveBeenCalledWith('windupMs', expect.objectContaining({ rifleman: 900 }));
  });

  it('formats the out-of-view bonus and the derived player values', () => {
    renderRig(createState(0));
    expect(screen.getByText('+400ms')).toBeTruthy();
    expect(screen.getByText('4.2')).toBeTruthy();
    expect(screen.getByText('100°')).toBeTruthy();
  });

  it('resets on demand', () => {
    const { onReset } = renderRig(createState(0));
    fireEvent.click(screen.getByRole('button', { name: /Reset log and run/ }));
    expect(onReset).toHaveBeenCalledOnce();
  });
});

describe('Rig exhaustively', () => {
  const RANGES: readonly [string, string][] = [
    ['ranged token cap', '3'],
    ['melee token cap', '2'],
    ['tokens per living enemy', '0.5'],
    ['grant stagger', '300'],
    ['pistol grunt', '800'],
    ['shotgunner', '900'],
    ['rifleman', '1100'],
    ['melee rusher', '400'],
    ['fast melee', '300'],
    ['+ out of FOV', '600'],
    ['move speed', '5.5'],
    ['field of view', '110'],
    ['combo idle break', '2000'],
  ];
  const TOGGLES = [
    'through-wall silhouettes', 'peripheral threat arcs', 'audio commit tells',
  ] as const;

  it('reports every slider and every toggle', () => {
    const onConfig = vi.fn();
    render(
      <Rig view={buildRigView(createState(0), 0)} config={defaultConfig()}
        onConfig={onConfig} onReset={vi.fn()} />,
    );
    for (const [label, value] of RANGES) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    for (const label of TOGGLES) {
      fireEvent.click(screen.getByLabelText(label));
    }
    expect(onConfig.mock.calls.map(([key]) => key as string)).toStrictEqual([
      'rangedTokens', 'meleeTokens', 'tokensPerLiving', 'grantStaggerMs',
      'windupMs', 'windupMs', 'windupMs', 'windupMs', 'windupMs',
      'outOfFovBonusMs', 'playerSpeed', 'fovDegrees', 'comboBreakMs',
      'silhouettes', 'threatArcs', 'audioTells',
    ]);
  });

  it('renders every value formatter', () => {
    render(
      <Rig view={buildRigView(createState(0), 0)} config={defaultConfig()}
        onConfig={vi.fn()} onReset={vi.fn()} />,
    );
    expect(screen.getByText('1400ms')).toBeTruthy();
    expect(screen.getByText('+400ms')).toBeTruthy();
    expect(screen.getByText('4.2')).toBeTruthy();
    expect(screen.getByText('100°')).toBeTruthy();
    expect(screen.getByText('3000ms')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });
});
