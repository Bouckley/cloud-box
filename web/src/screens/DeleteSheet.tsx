import { useEffect, useRef, useState } from 'react';
import { Dialog } from '../app/Dialog.tsx';
import { TrashIcon } from '../app/icons.tsx';
import { FieldError } from './forms.tsx';

export type DeleteSheetProps = {
  what: 'photo' | 'file';
  count: number;
  /** Moves the items to Trash. The sheet closes when it resolves. */
  onConfirm(): Promise<void>;
  onClose(): void;
  /** Where focus goes afterwards if the button that opened the sheet is gone. */
  returnFocus?: (() => HTMLElement | null) | undefined;
};

function title(what: 'photo' | 'file', count: number): string {
  if (count === 1) return what === 'file' ? 'Delete this file?' : 'Delete this photo?';
  return `Delete ${count.toLocaleString()} ${what === 'file' ? 'files' : 'photos'}?`;
}

/**
 * Journey 3, web form (scope ruling S5): the only choice is Trash, and it is
 * reversible for 30 days. Focus starts on Cancel; Esc cancels.
 */
export function DeleteSheet({ what, count, onConfirm, onClose, returnFocus }: DeleteSheetProps) {
  const cancel = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const move = useRef<HTMLButtonElement>(null);
  // Move to Trash was disabled while it worked, which drops focus: put it back.
  useEffect(() => {
    if (failed) move.current?.focus();
  }, [failed]);
  const them = count === 1 ? 'it' : 'them';

  const confirm = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await onConfirm();
      onClose();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={title(what, count)}
      initialFocus={cancel}
      onClose={onClose}
      busy={busy}
      returnFocus={returnFocus}
      className="sheet"
    >
      <p className="sheet__lede">
        {count === 1
          ? 'It stays safe on your box until you choose.'
          : 'They stay safe on your box until you choose.'}
      </p>
      <div className="sheet__option">
        <TrashIcon size={22} />
        <div>
          <p className="sheet__option-title">Move to Trash</p>
          <p className="sheet__option-detail">You can restore {them} from Trash for 30 days.</p>
        </div>
      </div>
      {failed && <FieldError>Couldn&apos;t move {them} to Trash. Try again.</FieldError>}
      <div className="dialog__actions">
        <button ref={cancel} type="button" className="button" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          ref={move}
          type="button"
          className="button button--ink"
          onClick={() => void confirm()}
          disabled={busy}
        >
          {busy ? 'Moving to Trash…' : 'Move to Trash'}
        </button>
      </div>
    </Dialog>
  );
}
