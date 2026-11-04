import type { ItemView } from '@cloudbox/core';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { bytesText } from '../../app/format.ts';
import {
  AlbumsIcon,
  ChevronIcon,
  ChevronLeftIcon,
  CloseIcon,
  DownloadIcon,
  FileIcon,
  HeartIcon,
  InfoIcon,
  ShieldCheckIcon,
  ShieldClockIcon,
  TrashIcon,
  WarningIcon,
} from '../../app/icons.tsx';
import { useThumbUrl } from '../../app/thumbs.ts';
import { isVideo, whenText } from '../../app/timeline.ts';

/** Videos decrypt fully in memory (scope ruling S7); bigger ones are Download only. */
export const MAX_PLAY_BYTES = 2 * 2 ** 30;

export type ViewerProps = {
  item: ItemView;
  timeZone?: string | undefined;
  hasPrevious: boolean;
  hasNext: boolean;
  /** The box's status is known and the backup copy is running: only then can anything read "Safe". */
  backupOk: boolean;
  /** Decrypts a blob of this item. */
  load(item: ItemView, role: 'original' | 'preview', signal: AbortSignal): Promise<Blob>;
  onPrevious(): void;
  onNext(): void;
  onClose(): void;
  onFavourite(on: boolean): void;
  /** Saves the original; rejects if it did not finish. */
  onDownload(): Promise<void>;
  /** Opens the delete sheet for this photo. */
  onDelete(): void;
  /** Opens the album picker for this photo. */
  onAddToAlbum(): void;
  /** A polite status line, e.g. "Added to Garden". */
  said?: string | undefined;
};

type Media =
  | { kind: 'loading' }
  | { kind: 'image' | 'video'; url: string }
  | { kind: 'too-big' }
  | { kind: 'cant-show' };

/** What can be shown without loading anything: a reason not to, or which blob to load. */
function plan(item: ItemView): Media | 'original' | 'preview' {
  const video = isVideo(item);
  const original = item.blobs.original;
  if (video && original && original.size > MAX_PLAY_BYTES) return { kind: 'too-big' };
  const role = !video && item.blobs.preview ? 'preview' : 'original';
  const shows = video || role === 'preview' || (item.meta?.mime.startsWith('image/') ?? false);
  if (!shows || !item.blobs[role]) return { kind: 'cant-show' };
  return role;
}

function useMedia(item: ItemView, load: ViewerProps['load']): Media {
  const planned = plan(item);
  const role = typeof planned === 'string' ? planned : null;
  const [loaded, setLoaded] = useState<{ id: string; media: Media } | null>(null);
  useEffect(() => {
    if (!role) return;
    const ac = new AbortController();
    let url: string | null = null;
    load(item, role, ac.signal)
      .then((blob) => {
        if (ac.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setLoaded({ id: item.id, media: { kind: isVideo(item) ? 'video' : 'image', url } });
      })
      .catch(() => {
        if (!ac.signal.aborted) setLoaded({ id: item.id, media: { kind: 'cant-show' } });
      });
    return () => {
      ac.abort();
      if (url) URL.revokeObjectURL(url);
    };
    // A new item, not a new snapshot of the same one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, role, load]);
  if (!role) return planned as Media;
  return loaded?.id === item.id ? loaded.media : { kind: 'loading' };
}

/** One photo or video, large, with its tools. */
export function Viewer(p: ViewerProps) {
  const { item } = p;
  const media = useMedia(item, p.load);
  const thumb = useThumbUrl(item);
  const [showDetails, setShowDetails] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const detailsId = useId();
  const detailsTitle = useId();
  const when = item.meta ? whenText(item, { timeZone: p.timeZone }) : "Photo that can't be read";
  const name = item.meta?.name ?? '';
  const favourite = item.meta?.favourite ?? false;

  // Keys work anywhere on the page, except while typing.
  const keys = useRef(p);
  useLayoutEffect(() => {
    keys.current = p;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
      const t = e.target;
      if (t instanceof Element && t.closest('input, textarea, select, video')) return;
      // A dialog (the delete sheet) owns the keys while it is open: Esc closes it, not the viewer.
      if (document.querySelector('dialog[open]')) return;
      const k = keys.current;
      if (e.key === 'ArrowLeft' && k.hasPrevious) k.onPrevious();
      else if (e.key === 'ArrowRight' && k.hasNext) k.onNext();
      else if (e.key === 'Escape') k.onClose();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Moving to another photo: announce it by moving focus to its heading.
  useEffect(() => {
    if (document.activeElement === document.body || !document.activeElement) {
      headingRef.current?.focus();
    }
  }, [item.id]);

  const safe = item.state === 'replicated' && p.backupOk;
  const [downloading, setDownloading] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const download = () => {
    setDownloading(true);
    setDownloadFailed(false);
    p.onDownload()
      .catch(() => setDownloadFailed(true))
      .finally(() => setDownloading(false));
  };

  return (
    <div className={`viewer${showDetails ? ' viewer--details' : ''}`}>
      <div className="viewer__bar">
        <button type="button" className="button" onClick={p.onClose}>
          <CloseIcon size={18} />
          Close
        </button>
        <h1 ref={headingRef} tabIndex={-1} className="viewer__title">
          {when}
        </h1>
      </div>

      {/* Looking comes first: on phones the photo sits above the tools. */}
      <div className="viewer__stage">
        {media.kind === 'image' && <img className="viewer__media" src={media.url} alt={when} />}
        {media.kind === 'video' && (
          // Our own videos have no caption track to offer.
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video className="viewer__media" src={media.url} controls aria-label={when} />
        )}
        {media.kind === 'loading' && thumb && (
          <img className="viewer__media viewer__media--soft" src={thumb} alt={when} />
        )}
        {(media.kind === 'too-big' || media.kind === 'cant-show') && (
          <div className="viewer__note">
            <FileIcon size={40} />
            <p>
              {media.kind === 'too-big'
                ? 'This video is too big to play here. Download it to watch it.'
                : "This can't be shown here. Download it to open it."}
            </p>
          </div>
        )}
      </div>

      <div className="viewer__tools">
        <button type="button" className="button" onClick={p.onPrevious} disabled={!p.hasPrevious}>
          <ChevronLeftIcon size={18} />
          Previous
        </button>
        <button type="button" className="button" onClick={p.onNext} disabled={!p.hasNext}>
          Next
          <ChevronIcon size={18} />
        </button>
        <button
          type="button"
          className="button viewer__fav"
          aria-pressed={favourite}
          onClick={() => p.onFavourite(!favourite)}
          disabled={!item.meta}
        >
          <HeartIcon size={18} />
          Favourite
        </button>
        <button type="button" className="button" onClick={p.onAddToAlbum}>
          <AlbumsIcon size={18} />
          Add to album
        </button>
        <button
          type="button"
          className="button"
          aria-expanded={showDetails}
          aria-controls={detailsId}
          onClick={() => setShowDetails((s) => !s)}
        >
          <InfoIcon size={18} />
          Details
        </button>
        <button type="button" className="button" onClick={download} disabled={downloading}>
          <DownloadIcon size={18} />
          {downloading ? 'Downloading…' : 'Download'}
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

      {showDetails && (
        <section id={detailsId} className="viewer__details" aria-labelledby={detailsTitle}>
          <h2 id={detailsTitle}>Details</h2>
          <dl>
            <dt>Name</dt>
            <dd>{name}</dd>
            <dt>Size</dt>
            <dd>{item.meta ? bytesText(item.meta.size) : ''}</dd>
          </dl>
          <p className={safe ? 'viewer__safe' : 'viewer__pending'}>
            {safe ? <ShieldCheckIcon size={20} /> : <ShieldClockIcon size={20} />}
            {safe ? 'Safe: on your box and the backup copy' : 'On your box. Backup copy pending.'}
          </p>
        </section>
      )}
    </div>
  );
}
