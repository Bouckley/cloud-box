import type { CollectionView } from '@cloudbox/core';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Dialog } from '../../app/Dialog.tsx';
import { FilesIcon } from '../../app/icons.tsx';
import { Choice, FieldError } from '../forms.tsx';

export type MovePickerProps = {
  /** The file being moved, for the title. */
  name: string;
  folders: { folder: CollectionView; where: string | null }[];
  /** The folder it is in now: shown, but it can't be chosen. */
  hereId: string;
  /** Moves the file; the picker closes when it resolves. */
  onMove(folderId: string): Promise<void>;
  onClose(): void;
  returnFocus?: (() => HTMLElement | null) | undefined;
};

/** "Move to…": every folder as a radio row, the first other one chosen. */
export function MovePicker({
  name,
  folders,
  hereId,
  onMove,
  onClose,
  returnFocus,
}: MovePickerProps) {
  const group = useId();
  const first = useRef<HTMLInputElement>(null);
  const submit = useRef<HTMLButtonElement>(null);
  const firstId = folders.find((f) => f.folder.id !== hereId)?.folder.id ?? null;
  const [chosen, setChosen] = useState(firstId);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (failed) submit.current?.focus();
  }, [failed]);

  const move = async (e: FormEvent) => {
    e.preventDefault();
    if (!chosen) return;
    setBusy(true);
    setFailed(false);
    try {
      await onMove(chosen);
      onClose();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={`Move "${name}"`}
      initialFocus={first}
      onClose={onClose}
      busy={busy}
      returnFocus={returnFocus}
      className="sheet picker"
    >
      <form className="dialog__form" onSubmit={(e) => void move(e)} noValidate>
        <fieldset className="choices picker__list">
          <legend className="visually-hidden">Folders</legend>
          {folders.map(({ folder, where }) => (
            <Choice
              key={folder.id}
              ref={folder.id === firstId ? first : undefined}
              name={group}
              value={folder.id}
              checked={chosen === folder.id}
              label={folder.name ?? ''}
              detail={folder.id === hereId ? "It's here now" : where ? `In ${where}` : undefined}
              media={
                <span className="choice__cover" aria-hidden="true">
                  <FilesIcon size={20} />
                </span>
              }
              disabled={busy || folder.id === hereId}
              onChoose={() => setChosen(folder.id)}
            />
          ))}
        </fieldset>
        {failed && <FieldError>Couldn&apos;t move the file. Try again.</FieldError>}
        <div className="dialog__actions">
          <button type="button" className="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            ref={submit}
            type="submit"
            className="button button--primary"
            disabled={busy || !chosen}
          >
            {busy ? 'Moving…' : 'Move'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
