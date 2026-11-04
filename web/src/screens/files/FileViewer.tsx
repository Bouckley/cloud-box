import type { ItemView } from '@cloudbox/core';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MAX_IN_MEMORY } from '../../app/download.ts';
import { opensInTab } from '../../app/files.ts';
import { bytesText } from '../../app/format.ts';
import {
  CloseIcon,
  DownloadIcon,
  FileIcon,
  FilesIcon,
  TrashIcon,
  WarningIcon,
} from '../../app/icons.tsx';

export type FileViewerProps = {
  item: ItemView;
  /** The folder it is in: `Files › Taxes`. */
  where: string;
  /** Decrypts a blob of this item, typed for the browser. */
  load(item: ItemView, role: 'original' | 'preview', signal: AbortSignal): Promise<Blob>;
  onClose(): void;
  /** Saves the original; rejects if it did not finish. */
  onDownload(): Promise<void>;
  onMove(): void;
  onDelete(): void;
  /** A polite status line, e.g. "Moved to Taxes". */
  said?: string | undefined;
};

type Shown =
  | { kind: 'loading' }
  | { kind: 'image' | 'pdf'; url: string }
  | { kind: 'too-big' }
  | { kind: 'cant-show' };

/** Which blob to decrypt, or why nothing is. Photos use their smaller preview. */
function plan(item: ItemView): Shown | { role: 'original' | 'preview'; kind: 'image' | 'pdf' } {
  const mime = item.meta?.mime ?? '';
  if (!opensInTab(mime)) return { kind: 'cant-show' };
  const kind = mime === 'application/pdf' ? 'pdf' : 'image';
  // Android Chrome has no PDF reader: a frame would stay blank.
  if (kind === 'pdf' && navigator.pdfViewerEnabled === false) return { kind: 'cant-show' };
  if (kind === 'image' && item.blobs.preview && item.meta?.previewMime)
    return { role: 'preview', kind };
  const size = item.blobs.original?.size ?? 0;
  if (!item.blobs.original) return { kind: 'cant-show' };
  if (size > MAX_IN_MEMORY) return { kind: 'too-big' };
  return { role: 'original', kind };
}

function useShown(item: ItemView, load: FileViewerProps['load']): Shown {
  const planned = plan(item);
  const role = 'role' in planned ? planned.role : null;
  const kind = 'role' in planned ? planned.kind : null;
  const [loaded, setLoaded] = useState<{ id: string; shown: Shown } | null>(null);
  useEffect(() => {
    if (!role || !kind) return;
    const ac = new AbortController();
    let url: string | null = null;
    load(item, role, ac.signal)
      .then((blob) => {
        if (ac.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setLoaded({ id: item.id, shown: { kind, url } });
      })
      .catch(() => {
        if (!ac.signal.aborted) setLoaded({ id: item.id, shown: { kind: 'cant-show' } });
      });
    return () => {
      ac.abort();
      if (url) URL.revokeObjectURL(url);
    };
    // A new item, not a new snapshot of the same one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, role, kind, load]);
  if (!role) return planned as Shown;
  return loaded?.id === item.id ? loaded.shown : { kind: 'loading' };
}

/**
 * A photo or PDF from Files, shown inside Cloud Box: decrypted in this
 * browser, never sent anywhere. PDFs use the browser's own reader in a frame.
 */
export function FileViewer(p: FileViewerProps) {
  const { item } = p;
  const name = item.meta?.name ?? "File that can't be read";
  const shown = useShown(item, p.load);
  const heading = useRef<HTMLHeadingElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);

  const latest = useRef(p);
  useLayoutEffect(() => {
    latest.current = p;
  });
  useEffect(() => {
    heading.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // A dialog (move, delete) owns Esc while it is open.
      if (document.querySelector('dialog[open]')) return;
      e.preventDefault();
      latest.current.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const download = () => {
    setDownloading(true);
    setDownloadFailed(false);
    p.onDownload()
      .catch(() => setDownloadFailed(true))
      .finally(() => setDownloading(false));
  };

  const size = item.meta ? bytesText(item.meta.size) : '';
  return (
    <div className="viewer file-viewer">
      <div className="viewer__bar">
        <button type="button" className="button" onClick={p.onClose}>
          <CloseIcon size={18} />
          Close
        </button>
        <div className="file-viewer__title">
          <h1 ref={heading} tabIndex={-1} className="viewer__title">
            {name}
          </h1>
          <p className="file-viewer__where">
            {[`In ${p.where}`, size].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      <div className="viewer__stage file-viewer__stage">
        {shown.kind === 'image' && <img className="viewer__media" src={shown.url} alt={name} />}
        {shown.kind === 'pdf' && (
          <iframe className="file-viewer__pdf" src={shown.url} title={name} />
        )}
        {shown.kind === 'loading' && (
          <p className="waiting" aria-live="polite">
            Opening {name}…
          </p>
        )}
        {(shown.kind === 'too-big' || shown.kind === 'cant-show') && (
          <div className="viewer__note">
            <FileIcon size={40} />
            <p>
              {shown.kind === 'too-big'
                ? 'This file is too big to show here. Download it to open it.'
                : "This can't be shown here. Download it to open it."}
            </p>
          </div>
        )}
      </div>

      <div className="viewer__tools">
        <button type="button" className="button" onClick={download} disabled={downloading}>
          <DownloadIcon size={18} />
          {downloading ? 'Downloading…' : 'Download'}
        </button>
        <button type="button" className="button" onClick={p.onMove}>
          <FilesIcon size={18} />
          Move to…
        </button>
        <button type="button" className="button" onClick={p.onDelete}>
          <TrashIcon size={18} />
          Delete
        </button>
        <p className="viewer__said" role="status">
          {p.said}
        </p>
        {downloadFailed && (
          <p className="form-error viewer__error" role="alert">
            <WarningIcon size={18} />
            The download didn&apos;t finish. Try again.
          </p>
        )}
      </div>
    </div>
  );
}
