import type { ItemView } from '@cloudbox/core';
import { useRef, useState } from 'react';
import { Dialog } from '../../app/Dialog.tsx';
import { bytesText } from '../../app/format.ts';
import {
  ChevronIcon,
  CloseIcon,
  DownloadIcon,
  FileIcon,
  FilesIcon,
  TrashIcon,
} from '../../app/icons.tsx';
import { FieldError } from '../forms.tsx';

export type FileDetailsProps = {
  item: ItemView;
  /** The folder it is in: `Files › Taxes`. */
  where: string;
  /** Saves the original; rejects if it did not finish. */
  onDownload(): Promise<void>;
  onMove(): void;
  onDelete(): void;
  onClose(): void;
  returnFocus?: (() => HTMLElement | null) | undefined;
};

/**
 * A file the browser can't show (an installer, a spreadsheet): what it is,
 * and Download, Move to… or Delete. Nothing downloads until asked.
 */
export function FileDetails({
  item,
  where,
  onDownload,
  onMove,
  onDelete,
  onClose,
  returnFocus,
}: FileDetailsProps) {
  const close = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const name = item.meta?.name ?? "File that can't be read";
  const modified = Date.parse(item.meta?.modifiedAt ?? '');

  const download = () => {
    setBusy(true);
    setFailed(false);
    onDownload()
      .catch(() => setFailed(true))
      .finally(() => setBusy(false));
  };

  return (
    <Dialog
      title={name}
      initialFocus={close}
      onClose={onClose}
      returnFocus={returnFocus}
      className="sheet file-details"
    >
      <p className="sheet__lede file-details__lede">
        <FileIcon size={20} />
        This can&apos;t be shown here. Download it to open it.
      </p>
      <dl className="file-details__facts">
        <dt>Size</dt>
        <dd>{item.meta ? bytesText(item.meta.size) : ''}</dd>
        {modified ? (
          <>
            <dt>Modified</dt>
            <dd>
              {new Date(modified).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </dd>
          </>
        ) : null}
        <dt>Folder</dt>
        <dd>In {where}</dd>
      </dl>
      {failed && <FieldError>The download didn&apos;t finish. Try again.</FieldError>}
      <button
        type="button"
        className="button button--primary file-details__download"
        onClick={download}
        disabled={busy}
      >
        <DownloadIcon size={18} />
        {busy ? 'Downloading…' : 'Download'}
      </button>
      <ul className="action-list" aria-label="More for this file">
        <li>
          <button type="button" className="action-list__row" onClick={onMove}>
            <FilesIcon size={20} />
            <span>Move to…</span>
            <ChevronIcon size={18} />
          </button>
        </li>
        <li>
          <button type="button" className="action-list__row" onClick={onDelete}>
            <TrashIcon size={20} />
            <span>Delete</span>
            <ChevronIcon size={18} />
          </button>
        </li>
      </ul>
      <button
        ref={close}
        type="button"
        className="icon-button file-details__close"
        aria-label="Close"
        onClick={onClose}
      >
        <CloseIcon size={22} />
      </button>
    </Dialog>
  );
}
