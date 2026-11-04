import type { CollectionView } from '@cloudbox/core';
import { useId, useRef, useState } from 'react';
import { Dialog } from '../../app/Dialog.tsx';
import { FilesIcon, UploadIcon } from '../../app/icons.tsx';
import { Choice } from '../forms.tsx';

export type UploadSheetProps = {
  folders: { folder: CollectionView; where: string | null }[];
  /** The folder being looked at: where the files go unless changed. */
  folderId: string;
  /** Files were chosen; they go to the upload queue for that folder. */
  onChoose(files: File[], folderId: string): void;
  onClose(): void;
};

const pathOf = (f: { folder: CollectionView; where: string | null }) =>
  f.where ? `${f.where} › ${f.folder.name ?? ''}` : (f.folder.name ?? '');

/**
 * Upload: says which folder the files will be saved in (with `Change` to pick
 * another), then the browser's file chooser. Progress, duplicates and
 * failures show in the upload panel once the sheet closes.
 */
export function UploadSheet({ folders, folderId, onChoose, onClose }: UploadSheetProps) {
  const input = useRef<HTMLInputElement>(null);
  const group = useId();
  const listId = useId();
  // Only a folder the sheet can name: the words and the destination agree.
  const [to, setTo] = useState(() =>
    folders.some((f) => f.folder.id === folderId) ? folderId : (folders[0]?.folder.id ?? folderId),
  );
  const [changing, setChanging] = useState(false);
  const target = folders.find((f) => f.folder.id === to);

  return (
    <Dialog
      title="Upload"
      initialFocus={input}
      onClose={onClose}
      className="sheet picker upload-sheet"
    >
      <div className="dialog__form">
        <div className="upload-sheet__to">
          <FilesIcon size={20} />
          <p>Saving to {target ? pathOf(target) : 'Files'}</p>
          <button
            type="button"
            className="button"
            aria-expanded={changing}
            aria-controls={listId}
            onClick={() => setChanging((c) => !c)}
          >
            Change
          </button>
        </div>
        {changing && (
          <fieldset id={listId} className="choices picker__list">
            <legend className="visually-hidden">Folders</legend>
            {folders.map((f) => (
              <Choice
                key={f.folder.id}
                name={group}
                value={f.folder.id}
                checked={to === f.folder.id}
                label={f.folder.name ?? ''}
                detail={f.where ? `In ${f.where}` : undefined}
                media={
                  <span className="choice__cover" aria-hidden="true">
                    <FilesIcon size={20} />
                  </span>
                }
                onChoose={() => setTo(f.folder.id)}
              />
            ))}
          </fieldset>
        )}
        <div className="dialog__actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <label className="button button--primary file-pick">
            <UploadIcon size={18} />
            Choose files
            <input
              ref={input}
              type="file"
              multiple
              className="visually-hidden"
              onChange={(e) => {
                const files = Array.from(e.currentTarget.files ?? []);
                e.currentTarget.value = '';
                if (!files.length) return;
                onChoose(files, to);
                onClose();
              }}
            />
          </label>
        </div>
      </div>
    </Dialog>
  );
}
