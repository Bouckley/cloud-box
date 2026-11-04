import { useState, type FormEvent } from 'react';
import { Actions, Solo } from '../Solo.tsx';
import { Field, PLAIN, passwordProblems, type PasswordErrors } from '../forms.tsx';

/** Two password fields under the plan's one rule; shared by setup and recovery. */
export function NewPasswordFields({
  first,
  second,
  onFirst,
  onSecond,
  errors,
}: {
  first: string;
  second: string;
  onFirst(v: string): void;
  onSecond(v: string): void;
  errors: PasswordErrors;
}) {
  return (
    <>
      <Field
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 10 characters. A few words you will remember works well."
        value={first}
        onChange={(e) => onFirst(e.target.value)}
        error={errors.first}
        {...PLAIN}
      />
      <Field
        label="Type it again"
        type="password"
        autoComplete="new-password"
        value={second}
        onChange={(e) => onSecond(e.target.value)}
        error={errors.second}
        {...PLAIN}
      />
    </>
  );
}

/** Setup step 2: choose the password. */
export function PasswordStep({
  initial = '',
  onDone,
  onBack,
}: {
  initial?: string;
  onDone(password: string): void;
  onBack?: () => void;
}) {
  const [first, setFirst] = useState(initial);
  const [second, setSecond] = useState(initial);
  const [errors, setErrors] = useState<PasswordErrors>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = passwordProblems(first, second);
    setErrors(found);
    if (!found.first && !found.second) onDone(first);
  };

  return (
    <Solo
      title="Choose a password"
      lede="You'll type it each time you open Cloud Box in a browser. Nobody else can see your photos without it."
    >
      <form className="solo__form" onSubmit={submit} noValidate>
        <NewPasswordFields
          first={first}
          second={second}
          onFirst={(v) => {
            setFirst(v);
            setErrors({});
          }}
          onSecond={(v) => {
            setSecond(v);
            setErrors({});
          }}
          errors={errors}
        />
        <Actions step={2}>
          <button type="submit" className="button button--primary">
            Continue
          </button>
          {onBack && (
            <button type="button" className="button" onClick={onBack}>
              Back
            </button>
          )}
        </Actions>
      </form>
    </Solo>
  );
}
