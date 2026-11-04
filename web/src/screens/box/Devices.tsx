import type { DeviceView } from '@cloudbox/core';
import { useEffect, useState } from 'react';
import { sinceText } from '../../app/format.ts';
import { useUnlocked } from '../../app/session.tsx';
import { FieldError, generalProblem } from '../forms.tsx';

/**
 * The browsers and phones that can open this box. Task 17 adds Rename and
 * Revoke; this is the list journey 1 reads.
 */
export function Devices() {
  const { unlocked } = useUnlocked();
  const [devices, setDevices] = useState<DeviceView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!unlocked) return;
    let live = true;
    unlocked.devices().then(
      (d) => live && setDevices(d.filter((x) => x.revokedAt === null)),
      (e: unknown) => live && setError(generalProblem(e)),
    );
    return () => {
      live = false;
    };
  }, [unlocked]);

  const now = new Date();
  return (
    <section className="card box-section" aria-labelledby="devices-title">
      <h2 id="devices-title">Devices</h2>
      {error && <FieldError>{error}</FieldError>}
      {!devices && !error && <p role="status">Loading devices…</p>}
      {devices && (
        <ul className="devices" aria-label="Devices">
          {devices.map((d) => (
            <li key={d.id} className="device">
              <span className="device__name">{d.name ?? 'Unnamed device'}</span>
              {d.isThis && <span className="device__this">This browser</span>}
              <span className="device__seen">Last seen {sinceText(d.lastSeen, now)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
