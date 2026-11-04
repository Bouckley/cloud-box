import { useId, useRef, useState } from 'react';
import { Dialog } from '../../app/Dialog.tsx';
import { Choice, FieldError } from '../forms.tsx';

export type DeleteAlbumDialogProps = {
  name: string;
  /** Photos in the album, outside Trash. */
  count: number;
  /** Deletes the album; the dialog closes when it resolves. */
  onConfirm(items: 'keep' | 'trash'): Promise<void>;
  onClose(): void;
  returnFocus?: (() => HTMLElement | null) | undefined;
};

/**
 * Deletes an album. Its photos stay by default (back in Photos); moving them
 * to Trash is the other choice, and still reversible for 30 days. Nothing here
 * deletes a photo for good, so the button is ink, not red.
 */
export function DeleteAlbumDialog({
  name,
  count,
  onConfirm,
  onClose,
  returnFocus,
}: DeleteAlbumDialogProps) {
  const cancel = useRef<HTMLButtonElement>(null);
  const group = useId();
  const [items, setItems] = useState<'keep' | 'trash'>('keep');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const one = count === 1;

  const confirm = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await onConfirm(count === 0 ? 'keep' : items);
      onClose();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={`Delete "${name}"?`}
      initialFocus={cancel}
      onClose={onClose}
      busy={busy}
      returnFocus={returnFocus}
      className="sheet"
    >
      {count === 0 ? (
        <p className="sheet__lede">There are no photos in it.</p>
      ) : (
        <fieldset className="choices">
          <legend className="visually-hidden">
            What happens to the {one ? 'photo' : 'photos'} in it
          </legend>
          <Choice
            name={group}
            value="keep"
            checked={items === 'keep'}
            label={one ? 'Keep the photo' : 'Keep the photos'}
            detail={one ? 'It moves back to Photos.' : 'They move back to Photos.'}
            disabled={busy}
            onChoose={() => setItems('keep')}
          />
          <Choice
            name={group}
            value="trash"
            checked={items === 'trash'}
            label={one ? 'Move the photo to Trash' : 'Move the photos to Trash'}
            detail={
              one
                ? 'You can restore it from Trash for 30 days.'
                : 'You can restore them from Trash for 30 days.'
            }
            disabled={busy}
            onChoose={() => setItems('trash')}
          />
        </fieldset>
      )}
      {failed && <FieldError>Couldn&apos;t delete the album. Try again.</FieldError>}
      <div className="dialog__actions">
        <button ref={cancel} type="button" className="button" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="button button--ink"
          onClick={() => void confirm()}
          disabled={busy}
        >
          {busy ? 'Deleting…' : 'Delete album'}
        </button>
      </div>
    </Dialog>
  );
}
