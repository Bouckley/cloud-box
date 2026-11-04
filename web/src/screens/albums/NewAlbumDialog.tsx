import { useRef, useState, type FormEvent } from 'react';
import { Dialog } from '../../app/Dialog.tsx';
import { Field, FieldError } from '../forms.tsx';

export const NAME_NEEDED = 'Give the album a name.';

export type NewAlbumDialogProps = {
  /** Set to rename an album: the dialog starts with this name. */
  current?: string | undefined;
  /** Creates or renames; the dialog closes when it resolves. */
  onSave(name: string): Promise<void>;
  onClose(): void;
};

/** Names a new album, or renames one. Focus starts in the name field. */
export function NewAlbumDialog({ current, onSave, onClose }: NewAlbumDialogProps) {
  const renaming = current !== undefined;
  const field = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(current ?? '');
  const [problem, setProblem] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setProblem(NAME_NEEDED);
      field.current?.focus();
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      await onSave(trimmed);
      onClose();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={renaming ? 'Rename album' : 'New album'}
      initialFocus={field}
      onClose={onClose}
      busy={busy}
      className="sheet"
    >
      <form className="dialog__form" onSubmit={(e) => void save(e)} noValidate>
        <Field
          ref={field}
          label="Name"
          value={name}
          maxLength={255}
          autoComplete="off"
          error={problem || undefined}
          readOnly={busy}
          onChange={(e) => {
            setName(e.target.value);
            setProblem('');
          }}
        />
        {failed && (
          <FieldError>
            {renaming
              ? "Couldn't rename the album. Try again."
              : "Couldn't create the album. Try again."}
          </FieldError>
        )}
        <div className="dialog__actions">
          <button type="button" className="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? (renaming ? 'Renaming…' : 'Creating…') : renaming ? 'Rename' : 'Create'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
