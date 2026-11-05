import { useState } from 'react';
import { QrCode } from '../../app/qr.tsx';
import { useUnlocked } from '../../app/session.tsx';
import { FieldError, generalProblem } from '../forms.tsx';

/** "ABCD EFGH IJKL …": easier to read out and type. */
export const codeGroups = (code: string) => code.match(/.{1,4}/g) ?? [code];

/** What the phone app (M3) scans: the same code, as a link it opens. */
export const pairLink = (code: string) => `cloudbox://pair?code=${code}`;

/**
 * Box › Add a device: a single-use code for a new browser or phone, in groups
 * of four to read out and type, and as a QR for the phone app to scan.
 */
export function AddDevice() {
  const { unlocked } = useUnlocked();
  const [pairing, setPairing] = useState<{ code: string; expiresAt: Date } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const make = async () => {
    if (!unlocked) return;
    setBusy(true);
    setError(null);
    try {
      setPairing(await unlocked.createPairingCode());
    } catch (e) {
      setError(generalProblem(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card box-section" aria-labelledby="add-device-title">
      <h2 id="add-device-title">Add a device</h2>
      <p className="lede">
        On the new browser, open this box&apos;s address and choose Connect. Then type this code.
      </p>
      {pairing && (
        <div className="pair">
          <p id="pair-code-label" className="pair__label">
            Pairing code
          </p>
          <output className="pair-code" aria-labelledby="pair-code-label">
            {codeGroups(pairing.code).map((g, i) => (
              <span key={i}>{g} </span>
            ))}
          </output>
          <QrCode text={pairLink(pairing.code)} />
          <p className="pair__valid">
            Valid until{' '}
            {pairing.expiresAt.toLocaleTimeString(undefined, {
              hour: 'numeric',
              minute: '2-digit',
            })}
            . It works once.
          </p>
        </div>
      )}
      {error && <FieldError>{error}</FieldError>}
      <div className="row">
        <button
          type="button"
          className={pairing ? 'button' : 'button button--primary'}
          onClick={() => void make()}
          disabled={busy}
        >
          {pairing ? 'Make a new code' : 'Add a device'}
        </button>
      </div>
    </section>
  );
}
