import { useRef, useState, type FormEvent } from 'react';
import { Dialog } from '../../app/Dialog.tsx';
import { Field, FieldError, passwordProblems, type PasswordErrors } from '../forms.tsx';

/**
 * A new password, typed twice (at least 10 characters). The keys are
 * re-wrapped here, in the browser; the box only stores the new wrapping.
 */
export function ChangePassword({
  onChange,
  onClose,
}: {
  onChange(password: string): Promise<void>;
  onClose(): void;
}) {
  const firstRef = useRef<HTMLInputElement>(null);
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = passwordProblems(first, second);
    setErrors(found);
    if (found.first || found.second) return;
    setBusy(true);
    setFailed(false);
    try {
      await onChange(first);
      onClose();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Change password"
      initialFocus={firstRef}
      onClose={onClose}
      busy={busy}
      className="sheet"
    >
      <form className="dialog__form" onSubmit={(e) => void submit(e)} noValidate>
        <Field
          ref={firstRef}
          label="New password"
          type="password"
          autoComplete="new-password"
          value={first}
          error={errors.first}
          readOnly={busy}
          onChange={(e) => {
            setFirst(e.target.value);
            setErrors({});
          }}
        />
        <Field
          label="Type it again"
          type="password"
          autoComplete="new-password"
          value={second}
          error={errors.second}
          readOnly={busy}
          onChange={(e) => {
            setSecond(e.target.value);
            setErrors({});
          }}
        />
        {failed && <FieldError>Couldn&apos;t change the password. Try again.</FieldError>}
        <div className="dialog__actions">
          <button type="button" className="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? 'Changing…' : 'Change password'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
