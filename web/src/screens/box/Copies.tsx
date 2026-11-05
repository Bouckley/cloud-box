import type { Status } from '@cloudbox/core';
import { useId } from 'react';
import { sinceText } from '../../app/format.ts';
import { DriveIcon, WarningIcon } from '../../app/icons.tsx';

type Row = { label: string; value: string; tone: 'ok' | 'quiet' | 'attention' };

/**
 * Where the copies are. The main drive is only ever `Connected`: the box
 * can't yet tell a healthy drive from a failing one (M4), so it never says
 * "Healthy". The backup copy says when it last ran, or what is wrong.
 */
export function backupRow(status: Status, now: Date): Row {
  const missing =
    status.warnings.some((w) => w.code === 'backup_missing') ||
    !status.drives.some((d) => d.role === 'backup');
  if (missing) return { label: 'Backup copy', value: 'Not connected', tone: 'attention' };
  if (!status.lastCopyAt) return { label: 'Backup copy', value: 'Not copied yet', tone: 'quiet' };
  return {
    label: 'Backup copy',
    value: `Updated ${sinceText(new Date(status.lastCopyAt), now)}`,
    tone: 'ok',
  };
}

export function Copies({ status, now }: { status: Status | null; now: Date }) {
  const id = useId();
  const rows: Row[] | null = status
    ? [{ label: 'Main drive', value: 'Connected', tone: 'ok' }, backupRow(status, now)]
    : null;
  return (
    <section className="card box-section" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>Copies</h2>
      {!rows ? (
        <p className="box-section__waiting">Checking your box…</p>
      ) : (
        <ul className="copies">
          {rows.map((r, i) => (
            <li
              key={r.label}
              className={`copy copy--${r.tone}`}
              data-tone={r.tone}
              aria-labelledby={`${id}-${i}`}
            >
              {r.tone === 'attention' ? (
                <span className="copy__icon" role="img" aria-label="Needs attention">
                  <WarningIcon size={24} />
                </span>
              ) : (
                <span className="copy__icon">
                  <DriveIcon size={24} />
                </span>
              )}
              <span id={`${id}-${i}`} className="copy__label">
                {r.label}
              </span>
              <span className="copy__value">{r.value}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
