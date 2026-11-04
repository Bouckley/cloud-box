import { Solo } from '../Solo.tsx';
import { FieldError } from '../forms.tsx';

/** After the check: the one moment something is sent to the box. */
export function Creating({ error, onRetry }: { error: string | null; onRetry(): void }) {
  if (error) {
    return (
      <Solo title="Setup didn't finish" lede="Nothing is lost. Your 24 words stay the same.">
        <FieldError>{error}</FieldError>
        <div className="solo__actions">
          <button type="button" className="button button--primary" onClick={onRetry}>
            Try again
          </button>
        </div>
      </Solo>
    );
  }
  return (
    <Solo title="Setting up your box…" busy>
      <p className="lede" role="status">
        Locking your keys with your password. This takes a few seconds.
      </p>
    </Solo>
  );
}
