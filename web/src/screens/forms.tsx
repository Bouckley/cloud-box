import { BoxError, ClientError } from '@cloudbox/core';
import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
} from 'react';
import { WarningIcon } from '../app/icons.tsx';

export const MIN_PASSWORD = 10;

/** The plan's only password rules: at least 10 characters, typed the same twice. */
export type PasswordErrors = { first?: string | undefined; second?: string | undefined };

export function passwordProblems(first: string, second: string): PasswordErrors {
  if ([...first].length < MIN_PASSWORD) return { first: 'Use at least 10 characters.' };
  if (first !== second) return { second: "The passwords don't match." };
  return {};
}

export const WRONG_PASSWORD = "That password isn't right.";
export const UNREACHABLE =
  "Can't reach your box. Check the light on the front of the box is on, and that this computer is on your home network.";
export const WRONG_WORDS = "Those words don't match this box.";

/** Recovery-word problems in the Copy table's words; null when it is not one. */
export function recoveryProblem(e: unknown): string | null {
  if (!(e instanceof ClientError)) return null;
  if (e.code === 'wrong_recovery_key') return WRONG_WORDS;
  if (e.code !== 'recovery_words') return null;
  const d = (e.detail ?? {}) as { reason?: string; index?: number };
  if (d.reason === 'count') return 'Enter all 24 words.';
  if (d.reason === 'unknown_word' && d.index) return `Word ${d.index} isn't a recovery word.`;
  return WRONG_WORDS;
}

/** What to say for an error no field owns. Never includes what was typed. */
export function generalProblem(e: unknown): string {
  if (e instanceof ClientError && e.code === 'box_unreachable') return UNREACHABLE;
  if (e instanceof BoxError) return `${e.message} ${e.action}`;
  return 'Something went wrong. Try again.';
}

type Common = { label: string; error?: string | null | undefined; hint?: ReactNode | undefined };

function useDescribed(
  id: string | undefined,
  error?: string | null | undefined,
  hint?: ReactNode | undefined,
) {
  const auto = useId();
  const fid = id ?? auto;
  const errId = `${fid}-error`;
  const hintId = `${fid}-hint`;
  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(' ');
  return { fid, errId, hintId, describedBy: describedBy || undefined };
}

function Parts({
  label,
  error,
  hint,
  ids,
  children,
}: Common & { ids: ReturnType<typeof useDescribed>; children: ReactNode }) {
  return (
    <div className="form-field">
      <label htmlFor={ids.fid}>{label}</label>
      {hint && (
        <p className="form-field__hint" id={ids.hintId}>
          {hint}
        </p>
      )}
      {children}
      {error && <FieldError id={ids.errId}>{error}</FieldError>}
    </div>
  );
}

/** An error tied to its field: shown until the field changes, never timed. */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p className="form-error" id={id} role="alert">
      <WarningIcon size={20} />
      <span>{children}</span>
    </p>
  );
}

/** A labelled input; errors and hints are tied to it with aria-describedby. */
export function Field({
  label,
  error,
  hint,
  id,
  className,
  ...input
}: Common & InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  const ids = useDescribed(id, error, hint);
  return (
    <Parts label={label} error={error} hint={hint} ids={ids}>
      <input
        id={ids.fid}
        className={className ? `input ${className}` : 'input'}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        {...input}
      />
    </Parts>
  );
}

export function TextArea({
  label,
  error,
  hint,
  id,
  ...area
}: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ids = useDescribed(id, error, hint);
  return (
    <Parts label={label} error={error} hint={hint} ids={ids}>
      <textarea
        id={ids.fid}
        className="input input--area"
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        {...area}
      />
    </Parts>
  );
}

/** Typing a password, a code or words: no autocorrect or capitalising. */
export const PLAIN = {
  autoCapitalize: 'none',
  autoCorrect: 'off',
  spellCheck: false,
} as const;

/**
 * One radio in a group, with a line of explanation read out as its
 * description, and an optional picture before the words (an album cover).
 */
export function Choice({
  name,
  value,
  checked,
  label,
  detail,
  media,
  disabled,
  onChoose,
  ref,
}: {
  name: string;
  value: string;
  checked: boolean;
  label: string;
  detail?: string | undefined;
  media?: ReactNode;
  disabled?: boolean | undefined;
  onChoose(): void;
  ref?: Ref<HTMLInputElement> | undefined;
}) {
  const id = useId();
  return (
    <label className="choice">
      <input
        ref={ref}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        aria-labelledby={`${id}-label`}
        aria-describedby={detail ? `${id}-detail` : undefined}
        onChange={onChoose}
      />
      {media}
      <span className="choice__text">
        <span className="choice__label" id={`${id}-label`}>
          {label}
        </span>
        {detail && (
          <span className="choice__detail" id={`${id}-detail`}>
            {detail}
          </span>
        )}
      </span>
    </label>
  );
}
