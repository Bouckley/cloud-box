import type { Status } from '@cloudbox/core';
import { useState } from 'react';
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

/**
 * Dev only (never in the production build): buttons for the box's simulator
 * API (doc 07), so hardware can be "pressed" and "unplugged" in the browser.
 */
export function SimPage() {
  useTitle('Box simulator');
  const [out, setOut] = useState('');
  const [seconds, setSeconds] = useState('3600');
  const [fill, setFill] = useState('95');

  const call = async (method: 'GET' | 'POST', path: string, body?: unknown) => {
    try {
      const res = await fetch(path, {
        method,
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await res.text();
      setOut(`${method} ${path} → ${res.status}\n${text}`);
    } catch {
      setOut(`${method} ${path} → the box did not answer`);
    }
  };
  const post = (path: string, body?: unknown) => () => void call('POST', path, body);

  return (
    <>
      <header className="screen-header">
        <h1>Box simulator</h1>
      </header>
      <p className="lede">
        Development only. These act on the simulated hardware of the box you are running.
      </p>
      <div className="sim-grid">
        <section className="card" aria-labelledby="sim-button">
          <h2 id="sim-button">Power button</h2>
          <div className="row">
            <button
              type="button"
              className="button button--primary"
              onClick={post('/dev/sim/button', { kind: 'short' })}
            >
              Short press
            </button>
            <button
              type="button"
              className="button"
              onClick={post('/dev/sim/button', { kind: 'long' })}
            >
              Long press
            </button>
          </div>
        </section>
        <section className="card" aria-labelledby="sim-drives">
          <h2 id="sim-drives">Drives</h2>
          <div className="row">
            <button
              type="button"
              className="button"
              onClick={post('/dev/sim/drives/backup', { present: false })}
            >
              Unplug backup
            </button>
            <button
              type="button"
              className="button"
              onClick={post('/dev/sim/drives/backup', { present: true })}
            >
              Plug in backup
            </button>
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
            <button
              type="button"
              className="button"
              onClick={post('/dev/sim/drives/main', { fillPercent: Number(fill) })}
            >
              Set main drive fill
            </button>
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
            <button
              type="button"
              className="button"
              onClick={post('/dev/sim/clock/advance', { seconds: Number(seconds) })}
            >
              Advance clock
            </button>
          </div>
        </section>
        <section className="card" aria-labelledby="sim-jobs">
          <h2 id="sim-jobs">Jobs</h2>
          <div className="row">
            {(['replicate', 'purge', 'cleanup', 'light'] as const).map((j) => (
              <button key={j} type="button" className="button" onClick={post(`/dev/sim/jobs/${j}`)}>
                Run {j}
              </button>
            ))}
          </div>
        </section>
        <section className="card" aria-labelledby="sim-state">
          <h2 id="sim-state">State</h2>
          <div className="row">
            <button
              type="button"
              className="button"
              onClick={() => void call('GET', '/dev/sim/state')}
            >
              Show state
            </button>
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
      <section aria-labelledby="sim-result" className="card">
        <h2 id="sim-result">Last result</h2>
        <pre className="output" aria-live="polite">
          {out || 'Nothing yet.'}
        </pre>
      </section>
    </>
  );
}
