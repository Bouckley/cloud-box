import type { Status } from '@cloudbox/core';
import { useCallback, useEffect, useState } from 'react';
import { SafetyBanner, type BannerInput } from '../app/SafetyBanner.tsx';
import { useTitle } from '../app/title.ts';

const sample = (over: Partial<Status>, items: Partial<Status['items']> = {}): BannerInput => ({
  kind: 'status',
  status: {
    safe: true,
    items: {
      total: 12480,
      verified: 12480,
      replicated: 12480,
      notYetCopied: 0,
      trashed: 0,
      ...items,
    },
    devices: [],
    drives: [],
    lastCopyAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    warnings: [],
    ...over,
  },
});
const warn = (code: string) => [{ code, message: '', action: '' }];

/** Every banner state, for checking the design in dev. Sample numbers only. */
const STATES: { label: string; input: BannerInput; photoCount?: number }[] = [
  { label: 'Checking', input: { kind: 'checking' } },
  { label: 'Safe', input: sample({}) },
  { label: 'Safe, on Photos', input: sample({}), photoCount: 12480 },
  { label: 'Copying', input: sample({ safe: false }, { notYetCopied: 3, replicated: 12477 }) },
  { label: 'Backup paused', input: sample({ safe: false, warnings: warn('backup_missing') }) },
  { label: 'Almost full', input: sample({ warnings: warn('storage_low') }) },
  { label: "Can't reach", input: { kind: 'unreachable' } },
];

type SimDrive = { role: string; sizeBytes: number; freeBytes: number };
type SimState = { light: string; clockOffsetSeconds: number; drives: SimDrive[] };

const percentFull = (d: SimDrive) => `${Math.round((1 - d.freeBytes / d.sizeBytes) * 100)}% full`;

function aheadText(seconds: number): string {
  if (seconds <= 0) return 'Real time';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [d && `${d} d`, h && `${h} h`, m && `${m} min`].filter(Boolean);
  return `${parts.length ? parts.join(' ') : `${seconds} s`} ahead`;
}

const lightText = (light: string) => {
  const words = light.replace(/[-_]/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** The simulator's state in words, as a developer would say it. */
function summary(s: SimState): [string, string][] {
  const main = s.drives.find((d) => d.role === 'main');
  const backup = s.drives.find((d) => d.role === 'backup');
  return [
    ['Light', lightText(s.light)],
    ['Main drive', main ? percentFull(main) : 'Missing'],
    ['Backup drive', backup ? `Plugged in, ${percentFull(backup)}` : 'Unplugged'],
    ['Clock', aheadText(s.clockOffsetSeconds)],
  ];
}

const NO_ANSWER = 'The box did not answer. Is make dev running?';

/**
 * Dev only (never in the production build): buttons for the box's simulator
 * API (doc 07), so hardware can be "pressed" and "unplugged" in the browser.
 * The simulator's own state is shown and refreshed after every press, since
 * the safety banner needs a signed-in browser before it can follow the box.
 */
export function SimPage() {
  useTitle('Box simulator');
  const [state, setState] = useState<SimState | null>(null);
  const [stateError, setStateError] = useState('');
  const [last, setLast] = useState('Nothing yet.');
  const [seconds, setSeconds] = useState('3600');
  const [fill, setFill] = useState('95');

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/dev/sim/state');
      if (!res.ok) throw new Error(String(res.status));
      setState((await res.json()) as SimState);
      setStateError('');
    } catch {
      setStateError(NO_ANSWER);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const act = (label: string, path: string, body?: unknown) => async () => {
    let res: Response;
    try {
      res = await fetch(path, {
        method: 'POST',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      setLast(NO_ANSWER);
      return;
    }
    if (res.ok) {
      setLast(`${label}: done`);
    } else {
      const err = (await res.json().catch(() => null)) as { message?: string } | null;
      setLast(`${label}: ${err?.message ?? `the box said ${res.status}`}`);
    }
    await refresh();
  };
  const button = (label: string, path: string, body?: unknown, primary = false) => (
    <button
      type="button"
      className={primary ? 'button button--primary' : 'button'}
      onClick={() => void act(label, path, body)()}
    >
      {label}
    </button>
  );

  return (
    <>
      <header className="screen-header">
        <h1>Box simulator</h1>
      </header>
      <p className="lede">
        Development only. These act on the simulated hardware of the box you are running. The banner
        above follows the box&apos;s real status only once this browser is signed in; until then it
        stays on &ldquo;Checking your box&rdquo;. The state below is read straight from the
        simulator.
      </p>
      <section className="card sim-now" aria-labelledby="sim-now">
        <h2 id="sim-now">The simulated box now</h2>
        {state ? (
          <dl className="sim-state">
            {summary(state).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p>{stateError || 'Asking the box…'}</p>
        )}
        <p className="sim-last" role="status" aria-label="Last action">
          {last}
        </p>
      </section>
      <div className="sim-grid">
        <section className="card" aria-labelledby="sim-button">
          <h2 id="sim-button">Power button</h2>
          <div className="row">
            {button('Short press', '/dev/sim/button', { kind: 'short' }, true)}
            {button('Long press', '/dev/sim/button', { kind: 'long' })}
          </div>
        </section>
        <section className="card" aria-labelledby="sim-drives">
          <h2 id="sim-drives">Drives</h2>
          <div className="row">
            {button('Unplug backup', '/dev/sim/drives/backup', { present: false })}
            {button('Plug in backup', '/dev/sim/drives/backup', { present: true })}
          </div>
          <label className="field">
            Main drive full (percent)
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              value={fill}
              onChange={(e) => setFill(e.target.value)}
            />
          </label>
          <div className="row">
            {button('Set main drive fill', '/dev/sim/drives/main', { fillPercent: Number(fill) })}
          </div>
        </section>
        <section className="card" aria-labelledby="sim-clock">
          <h2 id="sim-clock">Clock</h2>
          <label className="field">
            Seconds to move forward
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={1}
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
            />
          </label>
          <div className="row">
            {button('Advance clock', '/dev/sim/clock/advance', { seconds: Number(seconds) })}
          </div>
        </section>
        <section className="card" aria-labelledby="sim-jobs">
          <h2 id="sim-jobs">Jobs</h2>
          <div className="row">
            {(['replicate', 'purge', 'cleanup', 'light'] as const).map((j) => (
              <span key={j}>{button(`Run ${j}`, `/dev/sim/jobs/${j}`)}</span>
            ))}
          </div>
        </section>
      </div>
      <section aria-labelledby="sim-banners" className="card">
        <h2 id="sim-banners">Banner states (sample numbers)</h2>
        {STATES.map((st) => (
          <div key={st.label} className="field">
            {st.label}
            <SafetyBanner
              input={st.input}
              now={new Date()}
              photoCount={st.photoCount ?? null}
              linkToBox
            />
          </div>
        ))}
      </section>
    </>
  );
}
