import type { ItemView } from '@cloudbox/core';
import { useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { albumName, parseScope, scopeHome, scopeItems, type Scope } from '../../app/albums.ts';
import { saveOriginal } from '../../app/download.ts';
import { PhotosIcon } from '../../app/icons.tsx';
import { useLibrary, useStatus } from '../../app/session.tsx';
import { useTitle } from '../../app/title.ts';
import { UploadPanel } from '../../app/UploadPanel.tsx';
import { useUploads } from '../../app/uploads.ts';
import { DeleteSheet } from '../DeleteSheet.tsx';
import { GroupBy, useFocusId, useGrouping } from './GroupBy.tsx';
import { AddToAlbum, useSelecting } from './Selecting.tsx';
import { Timeline } from './Timeline.tsx';
import { UploadButton } from './UploadButton.tsx';
import { Viewer } from './Viewer.tsx';

/** The photos in a scope (every album by default), newest first, kept in step with the library. */
export function usePhotos(scope: Scope = { kind: 'all' }): { items: ItemView[]; ready: boolean } {
  const { snapshot } = useLibrary();
  const key = scope.kind === 'album' ? scope.id : scope.kind;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = useMemo(() => scopeItems(snapshot, scope), [snapshot, key]);
  return { items, ready: snapshot.syncedAt !== null };
}

/** The upload panel, while anything is uploading or has just finished. */
export function Uploads() {
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
  const grouping = useGrouping();
  const focusId = useFocusId();
  const empty = ready && items.length === 0;
  const select = useSelecting(items, !empty);
  return (
    <>
      <header className="screen-header photos-header">
        <h1>Photos</h1>
        <div className="photos-header__tools">
          {!empty && <GroupBy />}
          {select.button}
          <UploadButton ready={ready} />
        </div>
      </header>

      {select.bar}

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
        <Timeline items={items} grouping={grouping} focusId={focusId} {...select.timeline} />
      )}
    </>
  );
}

/** Where the viewer's Back goes, in words: "Back to Garden". */
function homeName(scope: Scope, name: (id: string) => string): string {
  switch (scope.kind) {
    case 'all':
      return 'Photos';
    case 'album':
      return name(scope.id);
    case 'favourites':
      return 'Favourites';
    case 'videos':
      return 'Videos';
  }
}

/**
 * `/photos/:itemId`. `?in=` names the scope it was opened from (an album,
 * Favourites or Videos): Previous and Next stay inside it and Back returns to it.
 */
export function PhotoViewerScreen() {
  const { itemId } = useParams();
  const [params] = useSearchParams();
  const scope = parseScope(params.get('in'));
  const { items, ready } = usePhotos(scope);
  const { library, snapshot } = useLibrary();
  const { status, refresh: refreshStatus } = useStatus();
  const navigate = useNavigate();
  const { search } = useLocation();
  // A photo leaving this list (to Trash, another album, or out of Favourites)
  // goes before the next one is shown; the viewer stays on it until then (no
  // flash of "isn't here", and focus stays put).
  const [moving, setMoving] = useState<ItemView | null>(null);
  const at = items.findIndex((i) => i.id === itemId);
  const item = at >= 0 ? items[at]! : moving?.id === itemId ? moving : null;
  useTitle(item ? 'Photo' : 'Photos');
  const [deleting, setDeleting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [said, setSaid] = useState('');

  const load = useCallback(
    async (it: ItemView, role: 'original' | 'preview', signal: AbortSignal) => {
      if (!library) throw new Error('locked');
      const bytes = await library.readBlob(it, role, signal);
      const type = (role === 'preview' ? it.meta?.previewMime : it.meta?.mime) ?? '';
      return new Blob([bytes as BlobPart], { type });
    },
    [library],
  );

  const home = scopeHome(scope);
  const homeSearch = (() => {
    const p = new URLSearchParams(search);
    p.delete('in');
    const s = p.toString();
    return s ? `?${s}` : '';
  })();
  const go = (to: ItemView | undefined) => {
    if (to) void navigate(`/photos/${to.id}${search}`, { replace: true });
  };
  const close = () => void navigate(`${home}${homeSearch}`, { state: { focus: item?.id } });

  /**
   * Runs an action after which this photo may no longer belong here; if it
   * leaves, show the next (older) one, or the newer one at the end, else go back.
   */
  const leaving = async (action: () => Promise<boolean>) => {
    if (!item) return;
    const after = items[at + 1] ?? items[at - 1];
    setMoving(item);
    try {
      if (await action()) {
        if (after) go(after);
        else void navigate(`${home}${homeSearch}`);
      }
    } finally {
      setMoving(null);
    }
  };

  if (!ready) {
    return (
      <p className="waiting" aria-live="polite">
        Opening your photos…
      </p>
    );
  }
  if (!item) {
    const name = (id: string) => {
      const c = snapshot.collections.get(id);
      return c && !c.deletedAt ? albumName(c) : 'Albums';
    };
    return (
      <div className="empty">
        <PhotosIcon size={40} />
        <h1>This photo isn't here</h1>
        <p>It may have been moved to Trash.</p>
        <button type="button" className="button" onClick={close}>
          Back to {homeName(scope, name)}
        </button>
      </div>
    );
  }
  return (
    <>
      <Viewer
        item={item}
        hasPrevious={at > 0}
        hasNext={at >= 0 && at < items.length - 1}
        backupOk={status !== null && !status.warnings.some((w) => w.code === 'backup_missing')}
        load={load}
        said={said}
        onPrevious={() => {
          setSaid('');
          go(items[at - 1]);
        }}
        onNext={() => {
          setSaid('');
          go(items[at + 1]);
        }}
        onClose={close}
        onFavourite={(on) => {
          if (!library) return;
          if (scope.kind === 'favourites' && !on) {
            void leaving(async () => {
              await library.setFavourite(item.id, false);
              return true;
            }).catch(() => {});
          } else {
            void library.setFavourite(item.id, on).catch(() => {});
          }
        }}
        inAlbum={scope.kind === 'album'}
        onAddToAlbum={() => {
          setSaid('');
          setAdding(true);
        }}
        onDownload={async () => {
          if (!library) throw new Error('locked');
          await saveOriginal(library, item);
        }}
        onDelete={() => setDeleting(true)}
      />
      {adding && (
        <AddToAlbum
          ids={[item.id]}
          from={scope.kind === 'album' ? scope.id : undefined}
          onAdded={(album) =>
            setSaid(`${scope.kind === 'album' ? 'Moved' : 'Added'} to ${album.name}`)
          }
          onClose={() => setAdding(false)}
          around={(run) =>
            leaving(async () => {
              const album = await run();
              // In an album's viewer, a photo moved to another album leaves this one.
              return scope.kind === 'album' && album.id !== scope.id;
            })
          }
        />
      )}
      {deleting && (
        <DeleteSheet
          what="photo"
          count={1}
          onConfirm={async () => {
            if (!library) throw new Error('locked');
            try {
              await leaving(async () => {
                await library.trash([item.id]);
                return true;
              });
            } finally {
              refreshStatus({ sync: false });
            }
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </>
  );
}
