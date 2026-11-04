import { useId, useState } from 'react';
import { generalProblem } from '../screens/forms.tsx';
import { CheckIcon, CloseIcon, WarningIcon } from './icons.tsx';
import type { UploadState } from './uploads.ts';

export type UploadPanelProps = {
  state: UploadState;
  busy: boolean;
  onRetry(id: number): void;
  /** Restores a duplicate from Trash; rejects if it did not. */
  onRestore(itemId: string): Promise<void>;
  onClose(): void;
};

/**
 * Upload progress and results. Stays until closed, so nothing that happened
 * to a file goes unseen (no auto-dismissing messages).
 */
export function UploadPanel({ state, busy, onRetry, onRestore, onClose }: UploadPanelProps) {
  const titleId = useId();
  const barId = useId();
  const listId = useId();
  // Failed files have gone through too: they wait in the list for Try again.
  const position = Math.min(state.done + state.failed.length + 1, state.total);
  const [restoring, setRestoring] = useState<ReadonlySet<string>>(new Set());
  const [restoreFailed, setRestoreFailed] = useState<ReadonlySet<string>>(new Set());
  const restore = (id: string) => {
    setRestoring((s) => new Set(s).add(id));
    setRestoreFailed((s) => without(s, id));
    onRestore(id)
      .catch(() => setRestoreFailed((s) => new Set(s).add(id)))
      .finally(() => setRestoring((s) => without(s, id)));
  };
  const title = busy ? `Uploading ${position} of ${state.total}` : 'Upload finished';
  const results = state.duplicates.length + state.failed.length;

  return (
    <section className="upload-panel" aria-labelledby={titleId}>
      <div className="upload-panel__head">
        <h2 id={titleId} aria-live="polite">
          {title}
        </h2>
        {!busy && (
          <button type="button" className="button" onClick={onClose}>
            <CloseIcon size={18} />
            Close
          </button>
        )}
      </div>
      {state.current && (
        <div className="upload-panel__file">
          <label htmlFor={barId} className="upload-panel__name">
            {state.current.name}
          </label>
          <progress
            id={barId}
            className="upload-panel__bar"
            value={state.current.sent}
            max={state.current.total || 1}
          />
        </div>
      )}
      {!busy && results === 0 && (
        <p className="upload-panel__ok">
          <CheckIcon size={18} />
          {state.done === 1 ? '1 file uploaded.' : `${state.done} files uploaded.`}
        </p>
      )}
      {results > 0 && (
        <>
          <p id={listId} className="visually-hidden">
            Results
          </p>
          <ul className="upload-panel__list" aria-labelledby={listId}>
            {state.duplicates.map((d, i) => (
              <li key={`d-${i}`} className="upload-row">
                <span className="upload-row__name">{d.name}</span>
                <span className="upload-row__note">
                  {d.trashed ? 'In Trash' : 'Already on your box'}
                </span>
                {d.trashed && restoreFailed.has(d.itemId) && (
                  <span className="upload-row__note" role="alert">
                    <WarningIcon size={18} />
                    Couldn&apos;t restore it. Try again.
                  </span>
                )}
                {d.trashed && (
                  <button
                    type="button"
                    className="button"
                    aria-label={`Restore ${d.name}`}
                    onClick={() => restore(d.itemId)}
                    disabled={restoring.has(d.itemId)}
                  >
                    Restore
                  </button>
                )}
              </li>
            ))}
            {state.failed.map((f) => (
              <li key={`f-${f.id}`} className="upload-row upload-row--failed">
                <span className="upload-row__name">{f.name}</span>
                <span className="upload-row__note">
                  <WarningIcon size={18} />
                  {generalProblem(f.error)}
                </span>
                <button
                  type="button"
                  className="button"
                  aria-label={`Try again ${f.name}`}
                  onClick={() => onRetry(f.id)}
                >
                  Try again
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function without(s: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(s);
  next.delete(id);
  return next;
}
