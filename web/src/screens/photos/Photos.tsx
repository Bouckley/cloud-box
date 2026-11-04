import type { ItemView } from '@cloudbox/core';
import { useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { saveOriginal } from '../../app/download.ts';
import { PhotosIcon } from '../../app/icons.tsx';
import { useLibrary, useStatus } from '../../app/session.tsx';
import { photoItems, type Grouping } from '../../app/timeline.ts';
import { useTitle } from '../../app/title.ts';
import { UploadPanel } from '../../app/UploadPanel.tsx';
import { useUploads } from '../../app/uploads.ts';
import { Timeline } from './Timeline.tsx';
import { UploadButton } from './UploadButton.tsx';
import { Viewer } from './Viewer.tsx';

const GROUPINGS: { value: Grouping; label: string }[] = [
  { value: 'days', label: 'Days' },
  { value: 'months', label: 'Months' },
  { value: 'years', label: 'Years' },
];

const asGrouping = (v: string | null): Grouping => (v === 'months' || v === 'years' ? v : 'days');

/** Every photo in every album, newest first, kept in step with the library. */
function usePhotos(): { items: ItemView[]; ready: boolean } {
  const { snapshot } = useLibrary();
  const items = useMemo(() => photoItems(snapshot), [snapshot]);
  return { items, ready: snapshot.syncedAt !== null };
}

function Uploads() {
  const { queue, state } = useUploads();
  const { library } = useLibrary();
  if (!queue || state.total === 0) return null;
  return (
    <UploadPanel
      state={state}
      busy={queue.busy}
      onRetry={(id) => queue.retry(id)}
      onRestore={async (id) => {
        if (!library) throw new Error('locked');
        await library.restore([id]);
        queue.markRestored(id);
      }}
      onClose={() => queue.close()}
    />
  );
}

export function PhotosScreen() {
  useTitle('Photos');
  const { items, ready } = usePhotos();
  const [params, setParams] = useSearchParams();
  const grouping = asGrouping(params.get('by'));
  const focusId = (useLocation().state as { focus?: string } | null)?.focus ?? null;
  const [selected, setSelected] = useState<Set<string> | null>(null);

  const toggle = useCallback((id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const empty = ready && items.length === 0;
  return (
    <>
      <header className="screen-header photos-header">
        <h1>Photos</h1>
        <div className="photos-header__tools">
          {!empty && (
            <div className="segmented" role="group" aria-label="Group photos by">
              {GROUPINGS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  className="segmented__option"
                  aria-pressed={grouping === g.value}
                  onClick={() =>
                    setParams(g.value === 'days' ? {} : { by: g.value }, { replace: true })
                  }
                >
                  {g.label}
                </button>
              ))}
            </div>
          )}
          {!empty && (
            <button
              type="button"
              className="button"
              aria-pressed={selected !== null}
              onClick={() => setSelected((s) => (s ? null : new Set()))}
            >
              Select
            </button>
          )}
          <UploadButton ready={ready} />
        </div>
      </header>

      {selected && (
        <div className="select-bar" role="region" aria-label="Selection">
          <p aria-live="polite">
            {selected.size === 0
              ? 'Choose photos'
              : selected.size === 1
                ? '1 selected'
                : `${selected.size} selected`}
          </p>
          <button type="button" className="button" onClick={() => setSelected(null)}>
            Cancel
          </button>
        </div>
      )}

      <Uploads />

      {!ready ? (
        <p className="waiting" aria-live="polite">
          Opening your photos…
        </p>
      ) : empty ? (
        <div className="empty">
          <PhotosIcon size={40} />
          <h2>No photos yet</h2>
          <p>Photos you upload are locked on this computer before they go to your box.</p>
        </div>
      ) : (
        <Timeline
          items={items}
          grouping={grouping}
          selected={selected ?? undefined}
          onToggle={selected ? toggle : undefined}
          focusId={focusId}
        />
      )}
    </>
  );
}

export function PhotoViewerScreen() {
  const { itemId } = useParams();
  const { items, ready } = usePhotos();
  const { library } = useLibrary();
  const { status } = useStatus();
  const navigate = useNavigate();
  const { search } = useLocation();
  const at = items.findIndex((i) => i.id === itemId);
  const item = at >= 0 ? items[at]! : null;
  useTitle(item ? 'Photo' : 'Photos');

  const load = useCallback(
    async (it: ItemView, role: 'original' | 'preview', signal: AbortSignal) => {
      if (!library) throw new Error('locked');
      const bytes = await library.readBlob(it, role, signal);
      const type = (role === 'preview' ? it.meta?.previewMime : it.meta?.mime) ?? '';
      return new Blob([bytes as BlobPart], { type });
    },
    [library],
  );

  const go = (to: ItemView | undefined) => {
    if (to) void navigate(`/photos/${to.id}${search}`, { replace: true });
  };
  const close = () => void navigate(`/photos${search}`, { state: { focus: item?.id } });

  if (!ready) {
    return (
      <p className="waiting" aria-live="polite">
        Opening your photos…
      </p>
    );
  }
  if (!item) {
    return (
      <div className="empty">
        <PhotosIcon size={40} />
        <h1>This photo isn't here</h1>
        <p>It may have been moved to Trash.</p>
        <button type="button" className="button" onClick={close}>
          Back to Photos
        </button>
      </div>
    );
  }
  return (
    <Viewer
      item={item}
      hasPrevious={at > 0}
      hasNext={at < items.length - 1}
      backupOk={status !== null && !status.warnings.some((w) => w.code === 'backup_missing')}
      load={load}
      onPrevious={() => go(items[at - 1])}
      onNext={() => go(items[at + 1])}
      onClose={close}
      onFavourite={(on) => void library?.setFavourite(item.id, on)}
      onDownload={async () => {
        if (!library) throw new Error('locked');
        await saveOriginal(library, item);
      }}
    />
  );
}
