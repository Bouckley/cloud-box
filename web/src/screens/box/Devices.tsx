import type { DeviceView } from '@cloudbox/core';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Dialog } from '../../app/Dialog.tsx';
import { sinceText } from '../../app/format.ts';
import { useUnlocked } from '../../app/session.tsx';
import { NewAlbumDialog } from '../albums/NewAlbumDialog.tsx';
import { FieldError, generalProblem } from '../forms.tsx';

const LAST_DEVICE = "It's the only device that can open your box. Add another first.";
const shown = (d: DeviceView) => d.name ?? 'Unnamed device';

export type DeviceListProps = {
  devices: DeviceView[];
  now: Date;
  /** Renames this browser; the dialog closes when it resolves. */
  onRename(d: DeviceView, name: string): Promise<void>;
  /** Removes a device; the dialog closes when it resolves. */
  onRevoke(d: DeviceView): Promise<void>;
};

/**
 * The browsers and phones that can open this box: name (or `Unnamed
 * device`), `Last seen`, and `This browser` on this one. This browser can be
 * renamed; any device can be revoked (asked first), except the last one.
 */
export function DeviceList({ devices, now, onRename, onRevoke }: DeviceListProps) {
  const id = useId();
  const active = devices.filter((d) => d.revokedAt === null);
  const [renaming, setRenaming] = useState<DeviceView | null>(null);
  const [revoking, setRevoking] = useState<DeviceView | null>(null);
  const only = active.length <= 1;
  return (
    <>
      <ul className="devices" aria-label="Devices">
        {active.map((d, i) => (
          <li key={d.id} className="device" aria-labelledby={`${id}-${i}`}>
            <span className="device__head">
              <span id={`${id}-${i}`} className="device__name">
                {shown(d)}
              </span>
              {d.isThis && <span className="device__this">This browser</span>}
            </span>
            <span className="device__seen">Last seen {sinceText(d.lastSeen, now)}</span>
            <span className="device__actions">
              {d.isThis && (
                <button
                  type="button"
                  className="button"
                  aria-label={`Rename ${shown(d)}`}
                  onClick={() => setRenaming(d)}
                >
                  Rename
                </button>
              )}
              <button
                type="button"
                className="button"
                aria-label={`Revoke ${shown(d)}`}
                aria-describedby={only ? `${id}-only` : undefined}
                disabled={only}
                onClick={() => setRevoking(d)}
              >
                Revoke
              </button>
            </span>
          </li>
        ))}
      </ul>
      {only && (
        <p id={`${id}-only`} className="devices__why">
          {LAST_DEVICE}
        </p>
      )}
      {renaming && (
        <NewAlbumDialog
          noun="browser"
          current={renaming.name ?? ''}
          onSave={(name) => onRename(renaming, name)}
          onClose={() => setRenaming(null)}
        />
      )}
      {revoking && (
        <RevokeDialog
          name={shown(revoking)}
          onConfirm={() => onRevoke(revoking)}
          onClose={() => setRevoking(null)}
        />
      )}
    </>
  );
}

function RevokeDialog({
  name,
  onConfirm,
  onClose,
}: {
  name: string;
  onConfirm(): Promise<void>;
  onClose(): void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const confirm = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await onConfirm();
      onClose();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={`Remove ${name}?`}
      initialFocus={cancel}
      onClose={onClose}
      busy={busy}
      className="sheet"
    >
      <p className="sheet__lede">It will need to be added again.</p>
      {failed && <FieldError>Couldn&apos;t remove it. Try again.</FieldError>}
      <div className="dialog__actions">
        <button ref={cancel} type="button" className="button" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="button button--ink"
          onClick={() => void confirm()}
          disabled={busy}
        >
          {busy ? 'Removing…' : 'Remove'}
        </button>
      </div>
    </Dialog>
  );
}

/** Box › Devices, wired to the box. */
export function Devices({ now }: { now: Date }) {
  const { unlocked, setUnlocked } = useUnlocked();
  const [devices, setDevices] = useState<DeviceView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!unlocked) return;
    try {
      setDevices(await unlocked.devices());
      setError(null);
    } catch (e) {
      setError(generalProblem(e));
    }
  }, [unlocked]);

  useEffect(() => {
    let live = true;
    unlocked?.devices().then(
      (d) => live && setDevices(d),
      (e: unknown) => live && setError(generalProblem(e)),
    );
    return () => {
      live = false;
    };
  }, [unlocked]);

  return (
    <section className="card box-section" aria-labelledby="devices-title">
      <h2 id="devices-title">Devices</h2>
      {error && <FieldError>{error}</FieldError>}
      {!devices && !error && <p className="box-section__waiting">Loading devices…</p>}
      {devices && unlocked && (
        <DeviceList
          devices={devices}
          now={now}
          onRename={async (d, name) => {
            await unlocked.renameDevice(d.id, name);
            await load();
          }}
          onRevoke={async (d) => {
            await unlocked.revokeDevice(d.id);
            // Removing this browser ends its session; locking rechecks the box,
            // which then says this browser was removed.
            if (d.isThis) setUnlocked(null);
            else await load();
          }}
        />
      )}
    </section>
  );
}
