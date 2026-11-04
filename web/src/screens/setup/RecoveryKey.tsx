import { Actions, Solo } from '../Solo.tsx';

/**
 * Setup step 4: the 24 words, numbered, in a card that prints on its own
 * (print.css shows only `.recovery-print`).
 */
export function RecoveryKey({
  words,
  onDone,
  onBack,
}: {
  words: string[];
  onDone(): void;
  onBack(): void;
}) {
  return (
    <Solo
      title="Your recovery key"
      lede="If you forget your password, these 24 words are the only way back in. Nobody else can recover your photos without them."
    >
      <section className="recovery-print" aria-labelledby="recovery-card-title">
        <p className="print-only print-title">Cloud Box recovery key</p>
        <h2 id="recovery-card-title" className="word-card__title">
          Write these words down, in order
        </h2>
        <ol className="word-card" aria-label="Recovery key words">
          {words.map((w, i) => (
            <li key={i}>
              <span className="word-num">{i + 1}</span>
              <span className="word">{w}</span>
            </li>
          ))}
        </ol>
        <p className="word-card__keep">
          Keep them on paper somewhere safe at home. Don't save them in a photo or an email.
        </p>
        <p className="print-only print-fields">
          Made on {new Date().toLocaleDateString(undefined, { dateStyle: 'long' })}. Kept at:
          ______________________
        </p>
        <p className="print-only">
          The only way into your photos if the password is forgotten. Anyone holding this sheet can
          open them: keep it private.
        </p>
      </section>
      <Actions step={4}>
        <button type="button" className="button button--primary" onClick={onDone}>
          I've written it down
        </button>
        <button type="button" className="button" onClick={() => window.print()}>
          Print
        </button>
        <button type="button" className="button" onClick={onBack}>
          Back
        </button>
      </Actions>
    </Solo>
  );
}
