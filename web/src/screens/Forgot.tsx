import { ClientError } from '@cloudbox/core';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useBox, useEntry } from '../app/session.tsx';
import { NewPasswordFields } from './setup/Password.tsx';
import { Actions, Solo } from './Solo.tsx';
import {
  FieldError,
  PLAIN,
  TextArea,
  generalProblem,
  passwordProblems,
  recoveryProblem,
} from './forms.tsx';
import { useFinish } from './useFinish.ts';

type Errors = {
  words?: string | null | undefined;
  first?: string | undefined;
  second?: string | undefined;
  other?: string | undefined;
};

/** Forgot password on a paired browser: the 24 words, then a new password. */
export function ForgotScreen() {
  const box = useBox();
  const { recheck } = useEntry();
  const finish = useFinish();
  const [words, setWords] = useState('');
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found: Errors = passwordProblems(first, second);
    if (!words.trim()) found.words = 'Enter all 24 words.';
    setErrors(found);
    if (found.words || found.first || found.second) return;
    setBusy(true);
    try {
      finish(await box.unlockWithRecovery(words, first));
    } catch (err) {
      setBusy(false);
      if (err instanceof ClientError && (err.code === 'revoked' || err.code === 'not_paired')) {
        return recheck();
      }
      const w = recoveryProblem(err);
      setErrors(w ? { words: w } : { other: generalProblem(err) });
    }
  };

  return (
    <Solo
      title="Forgot your password?"
      lede="Your 24-word recovery key lets you choose a new one. Type the words in order; capitals, spaces and new lines don't matter."
      busy={busy}
    >
      <form className="solo__form" onSubmit={(e) => void submit(e)} noValidate>
        <TextArea
          label="Recovery key"
          rows={5}
          autoComplete="off"
          value={words}
          onChange={(e) => {
            setWords(e.target.value);
            setErrors({ ...errors, words: null, other: undefined });
          }}
          error={errors.words}
          {...PLAIN}
        />
        <NewPasswordFields
          first={first}
          second={second}
          onFirst={(v) => {
            setFirst(v);
            setErrors({ ...errors, first: undefined, second: undefined });
          }}
          onSecond={(v) => {
            setSecond(v);
            setErrors({ ...errors, second: undefined });
          }}
          errors={errors}
        />
        {errors.other && <FieldError>{errors.other}</FieldError>}
        <Actions>
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? 'Checking the words…' : 'Set new password'}
          </button>
          <Link className="solo__link" to="/unlock">
            Back to Unlock
          </Link>
        </Actions>
      </form>
    </Solo>
  );
}
