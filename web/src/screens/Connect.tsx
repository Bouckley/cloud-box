import { BoxError, ClientError } from '@cloudbox/core';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { defaultDeviceName } from '../app/deviceName.ts';
import { WarningIcon } from '../app/icons.tsx';
import { useBox, useEntry } from '../app/session.tsx';
import { NewPasswordFields } from './setup/Password.tsx';
import { Actions, Solo } from './Solo.tsx';
import {
  Field,
  FieldError,
  PLAIN,
  TextArea,
  UNREACHABLE,
  generalProblem,
  passwordProblems,
  recoveryProblem,
} from './forms.tsx';
import { useFinish } from './useFinish.ts';

const BAD_CODE =
  "That code didn't work. A code works once, for 10 minutes. Make a new one on the other device and try again.";

/** A new browser on a set-up box: a code from another device, then the password. */
export function ConnectScreen({ revoked }: { revoked: boolean }) {
  const box = useBox();
  const { recheck } = useEntry();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [name, setName] = useState(() => defaultDeviceName(navigator.userAgent));
  const [errors, setErrors] = useState<{ code?: string | null | undefined; name?: string | null }>(
    {},
  );
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // Spaces are only for reading; '-' and '_' are part of the code.
    const clean = code.replace(/\s+/g, '');
    const found = {
      code: clean ? null : 'Enter the code shown on the other device.',
      name: name.trim() ? null : 'Give this browser a name.',
    };
    setErrors(found);
    if (found.code || found.name) return;
    setBusy(true);
    try {
      await box.pair(clean, name.trim());
      // Connected: from here it is an ordinary paired browser, so the
      // password (and Forgot your password?) live on Unlock.
      recheck();
      void navigate('/unlock', { replace: true });
      return;
    } catch (err) {
      setErrors({
        code:
          err instanceof BoxError && (err.status === 400 || err.status === 401)
            ? BAD_CODE
            : err instanceof ClientError && err.code === 'box_unreachable'
              ? UNREACHABLE
              : generalProblem(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Solo
      title="Connect this browser"
      lede="Your box is already set up. Connect this browser with a code from a phone or computer that already uses it."
      busy={busy}
    >
      {revoked && (
        <p className="notice" role="status">
          <WarningIcon size={20} />
          <span>This browser was removed from your box.</span>
        </p>
      )}
      <form className="solo__form" onSubmit={(e) => void submit(e)} noValidate>
        <Field
          label="Enter the code from another device"
          hint="On that device, open Box › Add a device."
          autoComplete="one-time-code"
          className="input--code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setErrors({ ...errors, code: null });
          }}
          error={errors.code}
          {...PLAIN}
        />
        <Field
          label="Name this browser"
          autoComplete="off"
          maxLength={60}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setErrors({ ...errors, name: null });
          }}
          error={errors.name}
        />
        <Actions>
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? 'Connecting…' : 'Connect'}
          </button>
          <Link className="solo__link" to="/reset">
            Lost all your devices? Use your recovery key
          </Link>
        </Actions>
      </form>
    </Solo>
  );
}

type ResetErrors = {
  words?: string | null | undefined;
  name?: string | null | undefined;
  first?: string | undefined;
  second?: string | undefined;
  other?: string | undefined;
  understood?: string | undefined;
};

/** Every device lost: the words sign out every device and connect this one. */
export function ResetScreen() {
  const box = useBox();
  const finish = useFinish();
  const [words, setWords] = useState('');
  const [name, setName] = useState(() => defaultDeviceName(navigator.userAgent));
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [errors, setErrors] = useState<ResetErrors>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found: ResetErrors = passwordProblems(first, second);
    if (!words.trim()) found.words = 'Enter all 24 words.';
    if (!name.trim()) found.name = 'Give this browser a name.';
    if (!understood) found.understood = 'Tick I understand to carry on.';
    setErrors(found);
    if (found.words || found.name || found.first || found.second || found.understood) return;
    setBusy(true);
    try {
      finish(await box.resetWithRecovery(words, first, name.trim()));
    } catch (err) {
      setBusy(false);
      const w = recoveryProblem(err);
      setErrors(w ? { words: w } : { other: generalProblem(err) });
    }
  };

  return (
    <Solo
      title="Use your recovery key"
      lede="If no phone or computer can open your box any more, your 24 words can."
      busy={busy}
    >
      <p className="notice notice--warning">
        <WarningIcon size={20} />
        <span>
          This signs out every phone and computer connected to your box. You'll need to add them
          again.
        </span>
      </p>
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
        <Field
          label="Name this browser"
          autoComplete="off"
          maxLength={60}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setErrors({ ...errors, name: null });
          }}
          error={errors.name}
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
        <label className="check">
          <input
            type="checkbox"
            checked={understood}
            aria-invalid={errors.understood ? true : undefined}
            aria-describedby={errors.understood ? 'understood-error' : undefined}
            onChange={(e) => {
              setUnderstood(e.target.checked);
              setErrors({ ...errors, understood: undefined });
            }}
          />
          <span>I understand</span>
        </label>
        {errors.understood && <FieldError id="understood-error">{errors.understood}</FieldError>}
        {errors.other && <FieldError>{errors.other}</FieldError>}
        <Actions>
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? 'Resetting…' : 'Reset and connect'}
          </button>
          <Link className="solo__link" to="/connect">
            Back
          </Link>
        </Actions>
      </form>
    </Solo>
  );
}
