import type { JSX } from 'react';
import { ARCHETYPES } from '../core/archetypes.js';
import type {
  Archetype, ArchetypeId, Config, InheritRule, PriorityRule,
} from '../core/types.js';
import type { RigView, SlotView } from './rigView.js';

export type ConfigSetter = <K extends keyof Config>(key: K, value: Config[K]) => void;

export interface RigProps {
  readonly view: RigView;
  readonly config: Config;
  readonly onConfig: ConfigSetter;
  readonly onReset: () => void;
}

interface SectionProps {
  readonly config: Config;
  readonly onConfig: ConfigSetter;
}

/** Ids may not contain spaces, or label association silently breaks. */
const slug = (label: string): string => label.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

const ms = (v: number): string => `${String(v)}ms`;

const median = (values: readonly number[]): string => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.at(Math.floor(sorted.length / 2));
  return mid === undefined ? '—' : `${(mid / 1000).toFixed(1)}s`;
};

const Range = ({ label, value, min, max, step, format, onChange }: {
  readonly label: string; readonly value: number; readonly min: number;
  readonly max: number; readonly step: number;
  readonly format: (v: number) => string;
  readonly onChange: (v: number) => void;
}): JSX.Element => (
  <div className="row">
    <label htmlFor={`r-${slug(label)}`}>{label}</label>
    <input
      id={`r-${slug(label)}`} type="range" min={min} max={max} step={step} value={value}
      onChange={(e): void => { onChange(Number(e.target.value)); }}
    />
    <span className="val">{format(value)}</span>
  </div>
);

const Toggle = ({ label, checked, onChange }: {
  readonly label: string; readonly checked: boolean;
  readonly onChange: (v: boolean) => void;
}): JSX.Element => (
  <div className="row">
    <label htmlFor={`t-${slug(label)}`}>{label}</label>
    <input
      id={`t-${slug(label)}`} type="checkbox" checked={checked}
      onChange={(e): void => { onChange(e.target.checked); }}
    />
  </div>
);

const Slot = ({ label, slot }: {
  readonly label: string;
  readonly slot: SlotView | undefined;
}): JSX.Element => (
  <div className={slot === undefined ? 'slot empty' : 'slot'}>
    <span className="tag">{label}</span>
    <span className="bar">
      <i style={{
        transform: `scaleX(${String(slot?.progress ?? 1)})`,
        background: slot?.colour ?? '#241636',
      }} />
    </span>
    <span className="who">{slot?.label ?? '—'}</span>
  </div>
);

/**
 * Slots are driven by the holder list, not a fixed count: with the per-living
 * slope turned up the cap exceeds two, and hardcoded rows would hide exactly
 * the holders the person tuning that slider needs to see. Pads to the flat
 * default so the panel keeps its shape at rest.
 */
const slotsFor = (held: readonly SlotView[], minimum: number): (SlotView | undefined)[] =>
  Array.from({ length: Math.max(minimum, held.length) }, (_, i) => held[i]);

const TokenSection = ({ view }: { readonly view: RigView }): JSX.Element => (
  <section className="grp">
    <h2 className="lbl">Commit tokens</h2>
    {slotsFor(view.ranged, 2).map((slot, i) => (
      <Slot key={`r${String(i)}`} label={`RANGED ${String(i + 1)}`} slot={slot} />
    ))}
    {slotsFor(view.melee, 1).map((slot, i) => (
      <Slot key={`m${String(i)}`} label={`MELEE ${String(i + 1)}`} slot={slot} />
    ))}
    <p className="note">A token frees only when the shot resolves or the holder dies.</p>
  </section>
);

const PressureSection = ({ config, onConfig }: SectionProps): JSX.Element => (
  <section className="grp">
    <h2 className="lbl">Pressure</h2>
    <Range label="ranged token cap" value={config.rangedTokens} min={0} max={4} step={1}
      format={String} onChange={(x): void => { onConfig('rangedTokens', x); }} />
    <Range label="melee token cap" value={config.meleeTokens} min={0} max={3} step={1}
      format={String} onChange={(x): void => { onConfig('meleeTokens', x); }} />
    <Range label="tokens per living enemy" value={config.tokensPerLiving}
      min={0} max={1} step={0.05} format={(x): string => x.toFixed(2)}
      onChange={(x): void => { onConfig('tokensPerLiving', x); }} />
    <Range label="grant stagger" value={config.grantStaggerMs} min={0} max={600} step={25}
      format={ms} onChange={(x): void => { onConfig('grantStaggerMs', x); }} />
    <div className="row">
      <label htmlFor="prio">priority</label>
      <select id="prio" value={config.priority}
        onChange={(e): void => { onConfig('priority', e.target.value as PriorityRule); }}>
        <option value="inFovFirst">in-FOV first</option>
        <option value="nearest">nearest</option>
        <option value="random">random</option>
      </select>
    </div>
    <div className="row">
      <label htmlFor="inh">on kill, next holder</label>
      <select id="inh" value={config.inherit}
        onChange={(e): void => { onConfig('inherit', e.target.value as InheritRule); }}>
        <option value="fresh">starts fresh</option>
        <option value="inheritRemaining">inherits remaining</option>
      </select>
    </div>
  </section>
);

const WindupSection = ({ config, onConfig }: SectionProps): JSX.Element => {
  const setOne = (id: ArchetypeId, value: number): void => {
    onConfig('windupMs', { ...config.windupMs, [id]: value });
  };
  return (
    <section className="grp">
      <h2 className="lbl">Wind-up</h2>
      {Object.values(ARCHETYPES).map((a: Archetype): JSX.Element => (
        <Range key={a.id} label={a.label} value={config.windupMs[a.id]}
          min={100} max={2500} step={25} format={ms}
          onChange={(x): void => { setOne(a.id, x); }} />
      ))}
      <Range label="+ out of FOV" value={config.outOfFovBonusMs} min={0} max={1200} step={50}
        format={(x): string => `+${ms(x)}`}
        onChange={(x): void => { onConfig('outOfFovBonusMs', x); }} />
      <p className="note">The deadline re-evaluates every frame but may only extend. Turning to face a threat never pulls death closer.</p>
    </section>
  );
};

const PlayerSection = ({ config, onConfig }: SectionProps): JSX.Element => (
  <section className="grp">
    <h2 className="lbl">Player</h2>
    <Range label="move speed" value={config.playerSpeed} min={1.5} max={8} step={0.1}
      format={(x): string => x.toFixed(1)}
      onChange={(x): void => { onConfig('playerSpeed', x); }} />
    <Range label="field of view" value={config.fovDegrees} min={60} max={130} step={5}
      format={(x): string => `${String(x)}°`}
      onChange={(x): void => { onConfig('fovDegrees', x); }} />
    <Range label="combo idle break" value={config.comboBreakMs} min={500} max={8000} step={250}
      format={ms} onChange={(x): void => { onConfig('comboBreakMs', x); }} />
  </section>
);

const ChannelSection = ({ config, onConfig }: SectionProps): JSX.Element => (
  <section className="grp">
    <h2 className="lbl">Information channels</h2>
    <Toggle label="through-wall silhouettes" checked={config.silhouettes}
      onChange={(x): void => { onConfig('silhouettes', x); }} />
    <Toggle label="peripheral threat arcs" checked={config.threatArcs}
      onChange={(x): void => { onConfig('threatArcs', x); }} />
    <Toggle label="audio commit tells" checked={config.audioTells}
      onChange={(x): void => { onConfig('audioTells', x); }} />
    <p className="note">Turn these off one at a time. If a channel can go without the fairness log moving, it is not earning its place.</p>
  </section>
);

const verdict = (view: RigView): { text: string; tone: string } => {
  if (view.log.deaths === 0) {
    return {
      text: 'Announced-by-neither must stay at zero. If it climbs, the commit gate is broken — not the numbers.',
      tone: 'dim',
    };
  }
  if (view.log.unannounced === 0) {
    return {
      text: 'Gate holding: every death so far was seen or heard at the moment it committed.',
      tone: 'ok',
    };
  }
  return {
    text: `${String(view.log.unannounced)} unannounced death(s). Fix the gate before touching wind-up.`,
    tone: 'bad',
  };
};

const LogSection = ({ view, onReset }: {
  readonly view: RigView; readonly onReset: () => void;
}): JSX.Element => {
  const v = verdict(view);
  return (
    <section className="grp">
      <h2 className="lbl">Fairness log</h2>
      <table>
        <tbody>
          <tr><td>deaths</td><td className="n">{view.log.deaths}</td></tr>
          <tr><td>killer seen at commit</td><td className="n">{view.log.seenAtCommit}</td></tr>
          <tr><td>killer heard at commit</td><td className="n">{view.log.heardAtCommit}</td></tr>
          <tr><td className="flag">announced by neither</td><td className="n bad">{view.log.unannounced}</td></tr>
          <tr><td>median survival</td><td className="n">{median(view.log.survivalMs)}</td></tr>
        </tbody>
      </table>
      <p className={`note ${v.tone}`}>{v.text}</p>
      <button type="button" onClick={onReset}>Reset log and run</button>
    </section>
  );
};

const RunSection = ({ view }: { readonly view: RigView }): JSX.Element => (
  <section className="grp">
    <h2 className="lbl">Run</h2>
    <table>
      <tbody>
        <tr><td>level</td><td className="n">{view.levelIndex + 1}</td></tr>
        <tr><td>combo</td><td className="n">{view.combo}</td></tr>
        <tr><td>score</td><td className="n">{view.score}</td></tr>
        <tr><td>best chain</td><td className="n">{view.bestCombo}</td></tr>
      </tbody>
    </table>
  </section>
);

export const Rig = ({ view, config, onConfig, onReset }: RigProps): JSX.Element => (
  <aside id="rig">
    <h1>Combat kernel</h1>
    <p className="sub">one-hit FPS · commit-token pressure · hybrid line of sight</p>
    <TokenSection view={view} />
    <PressureSection config={config} onConfig={onConfig} />
    <WindupSection config={config} onConfig={onConfig} />
    <PlayerSection config={config} onConfig={onConfig} />
    <ChannelSection config={config} onConfig={onConfig} />
    <LogSection view={view} onReset={onReset} />
    <RunSection view={view} />
  </aside>
);
