import { ClientError } from '@cloudbox/core';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useBox, useEntry } from '../app/session.tsx';
import { Actions, Solo } from './Solo.tsx';
import { Field, PLAIN, WRONG_PASSWORD, generalProblem } from './forms.tsx';
import { useFinish } from './useFinish.ts';

/** The password form, shared by Unlock and the last step of Connect. */
export function PasswordUnlock({ title, lede }: { title: string; lede: string }) {
  const box = useBox();
  const { recheck } = useEntry();
  const finish = useFinish();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) return setError('Enter your password.');
    setBusy(true);
    try {
      finish(await box.unlock(password));
    } catch (err) {
      setBusy(false);
      if (err instanceof ClientError && (err.code === 'revoked' || err.code === 'not_paired')) {
        return recheck();
      }
      setError(
        err instanceof ClientError && err.code === 'wrong_password'
          ? WRONG_PASSWORD
          : generalProblem(err),
      );
    }
  };

  return (
    <Solo title={title} lede={lede} busy={busy}>
      <form className="solo__form" onSubmit={(e) => void submit(e)} noValidate>
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
          error={error}
          {...PLAIN}
        />
        <Actions>
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? 'Unlocking…' : 'Unlock'}
          </button>
          <Link className="solo__link" to="/forgot">
            Forgot your password?
          </Link>
        </Actions>
      </form>
    </Solo>
  );
}

export const UnlockScreen = () => (
  <PasswordUnlock
    title="Unlock your Cloud Box"
    lede="Enter your password to see your photos and files."
  />
);
