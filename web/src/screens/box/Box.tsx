import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { KeyIcon } from '../../app/icons.tsx';
import { useLibrary, useStatus, useUnlocked } from '../../app/session.tsx';
import { useNow } from '../../app/Shell.tsx';
import { useTitle } from '../../app/title.ts';
import { useUploads } from '../../app/uploads.ts';
import { AddDevice } from './AddDevice.tsx';
import { ChangePassword } from './ChangePassword.tsx';
import { Copies } from './Copies.tsx';
import { Devices } from './Devices.tsx';
import { LockButton } from './LockButton.tsx';
import { Storage, storageParts } from './Storage.tsx';

/**
 * `/box`: the status card (the shell's banner, drawn large here), then
 * Storage, Copies, Devices and Add a device. `Change password` and `Lock`
 * sit beside the heading.
 */
export function BoxScreen() {
  useTitle('Box');
  const now = useNow();
  const { status } = useStatus();
  const { snapshot } = useLibrary();
  const { unlocked, setUnlocked } = useUnlocked();
  const navigate = useNavigate();
  const { state: uploads } = useUploads();
  const [changing, setChanging] = useState(false);
  const [said, setSaid] = useState('');
  const parts = useMemo(() => storageParts(snapshot), [snapshot]);
  const main = status?.drives.find((d) => d.role === 'main') ?? null;

  return (
    <>
      <header className="screen-header">
        <h1>Box</h1>
        <div className="screen-header__tools">
          <button
            type="button"
            className="button"
            disabled={!unlocked}
            onClick={() => {
              setSaid('');
              setChanging(true);
            }}
          >
            <KeyIcon size={18} />
            Change password
          </button>
          <LockButton
            uploading={uploads.queued + (uploads.current ? 1 : 0)}
            onLock={() => {
              // Wipes the keys from memory; the app asks for the password again.
              setUnlocked(null);
              void navigate('/', { replace: true });
            }}
          />
        </div>
      </header>
      <p className="screen-said" role="status">
        {said}
      </p>
      <div className="box-sections">
        <Storage drive={main} parts={parts} />
        <Copies status={status} now={now} />
        <Devices now={now} />
        <AddDevice />
      </div>
      {changing && unlocked && (
        <ChangePassword
          onChange={async (p) => {
            await unlocked.changePassword(p);
            setSaid('Password changed.');
          }}
          onClose={() => setChanging(false)}
        />
      )}
    </>
  );
}
