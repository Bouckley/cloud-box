import { useState, type FormEvent } from 'react';
import { Actions, Solo } from '../Solo.tsx';
import { Field, PLAIN } from '../forms.tsx';

/** The same leniency as recovery: any case, spaces, or the first 4 letters. */
function matches(typed: string, word: string): boolean {
  const t = typed.trim().toLowerCase();
  return t === word || (t.length === 4 && word.startsWith(t));
}

/** Two distinct word numbers, 1–24, in order. */
export function pickTwo(): [number, number] {
  const n = new Uint32Array(2);
  crypto.getRandomValues(n);
  const i = (n[0]! % 24) + 1;
  let j = (n[1]! % 23) + 1;
  if (j >= i) j++;
  return i < j ? [i, j] : [j, i];
}

/** Setup step 5: type two of the words back. Nothing is sent before this passes. */
export function ConfirmWords({
  words,
  pick,
  onConfirmed,
  onBack,
}: {
  words: string[];
  pick: [number, number];
  onConfirmed(): void;
  onBack(): void;
}) {
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [wrong, setWrong] = useState<number[]>([]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const bad = pick.filter((n) => !matches(typed[n] ?? '', words[n - 1] ?? ''));
    setWrong(bad);
    if (bad.length === 0) onConfirmed();
  };

  return (
    <Solo
      title="Check two words"
      lede="Type these two words from what you wrote down, so you know your copy is right."
    >
      <form className="solo__form" onSubmit={submit} noValidate>
        {pick.map((n) => (
          <Field
            key={n}
            label={`Word ${n}`}
            autoComplete="off"
            value={typed[n] ?? ''}
            onChange={(e) => {
              setTyped({ ...typed, [n]: e.target.value });
              setWrong(wrong.filter((w) => w !== n));
            }}
            error={wrong.includes(n) ? `Word ${n} doesn't match. Check what you wrote down.` : null}
            {...PLAIN}
          />
        ))}
        <Actions step={5}>
          <button type="submit" className="button button--primary">
            Finish setup
          </button>
          <button type="button" className="button" onClick={onBack}>
            Back
          </button>
        </Actions>
      </form>
    </Solo>
  );
}
