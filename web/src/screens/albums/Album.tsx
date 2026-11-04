import type { CollectionView } from '@cloudbox/core';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { albumName, countText, videoCountText, type Scope } from '../../app/albums.ts';
import {
  AlbumsIcon,
  ChevronLeftIcon,
  HeartIcon,
  PencilIcon,
  TrashIcon,
  VideoIcon,
} from '../../app/icons.tsx';
import { useLibrary, useStatus } from '../../app/session.tsx';
import { useTitle } from '../../app/title.ts';
import { GroupBy, useFocusId, useGrouping } from '../photos/GroupBy.tsx';
import { useSelecting } from '../photos/Selecting.tsx';
import { usePhotos } from '../photos/Photos.tsx';
import { TileScope } from '../photos/Tile.tsx';
import { Timeline } from '../photos/Timeline.tsx';
import { DeleteAlbumDialog } from './DeleteAlbumDialog.tsx';
import { NewAlbumDialog } from './NewAlbumDialog.tsx';

/**
 * A timeline of some of the photos (an album, Favourites, Videos): a way back
 * to Albums, the title with its count, the grouping, any actions, then the
 * photos or a line saying how to add some.
 */
function ScopedTimeline({
  scope,
  title,
  actions,
  empty,
}: {
  scope: Scope;
  title: string;
  actions?: ReactNode;
  empty: { icon: ReactNode; title: string; text: string };
}) {
  const { items, ready } = usePhotos(scope);
  const grouping = useGrouping();
  const focusId = useFocusId();
  const select = useSelecting(
    items,
    ready && items.length > 0,
    scope.kind === 'album' ? 'move' : 'add',
  );
  return (
    <>
      <Link to="/albums" className="back-link">
        <ChevronLeftIcon size={18} />
        Albums
      </Link>
      <header className="screen-header photos-header">
        <div className="scope-title">
          <h1>{title}</h1>
          {ready && (
            <p className="scope-title__count">
              {(scope.kind === 'videos' ? videoCountText : countText)(items.length)}
            </p>
          )}
        </div>
        <div className="photos-header__tools">
          {ready && items.length > 0 && <GroupBy />}
          {select.button}
          {actions}
        </div>
      </header>
      {select.bar}
      {!ready ? (
        <p className="waiting" aria-live="polite">
          Opening your photos…
        </p>
      ) : items.length === 0 ? (
        <div className="empty">
          {empty.icon}
          <h2>{empty.title}</h2>
          <p>{empty.text}</p>
        </div>
      ) : (
        <TileScope.Provider value={scope}>
          <Timeline items={items} grouping={grouping} focusId={focusId} {...select.timeline} />
        </TileScope.Provider>
      )}
    </>
  );
}

const isAlbum = (c: CollectionView | undefined): c is CollectionView =>
  !!c && c.kind === 'album' && c.role === null && c.deletedAt === null;

/** `/albums/:id`: one album, with Rename and Delete album. */
export function AlbumScreen() {
  const { id = '' } = useParams();
  const { library, snapshot } = useLibrary();
  const { refresh: refreshStatus } = useStatus();
  const navigate = useNavigate();
  const found = snapshot.collections.get(id);
  // While it is being deleted the album leaves the list before we leave the
  // page: keep showing it until then.
  const [leaving, setLeaving] = useState<CollectionView | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const album = isAlbum(found) ? found : leaving;
  const name = album ? albumName(album) : 'Album';
  useTitle(name);
  const { items } = usePhotos({ kind: 'album', id });

  if (snapshot.syncedAt !== null && !album) {
    return (
      <>
        <Link to="/albums" className="back-link">
          <ChevronLeftIcon size={18} />
          Albums
        </Link>
        <div className="empty">
          <AlbumsIcon size={40} />
          <h1>This album isn&apos;t here</h1>
          <p>It may have been deleted on another device.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <ScopedTimeline
        scope={{ kind: 'album', id }}
        title={name}
        actions={
          album && (
            <>
              <button
                type="button"
                className="button"
                disabled={!library || album.key === null}
                onClick={() => setRenaming(true)}
              >
                <PencilIcon size={18} />
                Rename
              </button>
              <button
                type="button"
                className="button"
                disabled={!library}
                onClick={() => setDeleting(true)}
              >
                <TrashIcon size={18} />
                Delete album
              </button>
            </>
          )
        }
        empty={{
          icon: <AlbumsIcon size={40} />,
          title: 'No photos in this album yet',
          text: 'In Photos, choose Select, pick some photos, then Add to album.',
        }}
      />
      {renaming && album && library && (
        <NewAlbumDialog
          current={album.name ?? ''}
          onSave={(n) => library.renameCollection(album.id, n)}
          onClose={() => setRenaming(false)}
        />
      )}
      {deleting && album && library && (
        <DeleteAlbumDialog
          name={name}
          count={items.length}
          onConfirm={async (what) => {
            setLeaving(album);
            try {
              await library.deleteCollection(album.id, what);
              void navigate('/albums', { replace: true });
            } catch (e) {
              setLeaving(null);
              throw e;
            } finally {
              if (what === 'trash') refreshStatus({ sync: false });
            }
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </>
  );
}

/** `/albums/favourites`: every photo with the heart set. */
export function FavouritesScreen() {
  useTitle('Favourites');
  return (
    <ScopedTimeline
      scope={{ kind: 'favourites' }}
      title="Favourites"
      empty={{
        icon: <HeartIcon size={40} />,
        title: 'No favourites yet',
        text: 'Open a photo and choose Favourite to keep it here too.',
      }}
    />
  );
}

/** `/albums/videos`: every video in Photos. */
export function VideosScreen() {
  useTitle('Videos');
  return (
    <ScopedTimeline
      scope={{ kind: 'videos' }}
      title="Videos"
      empty={{
        icon: <VideoIcon size={40} />,
        title: 'No videos yet',
        text: 'Videos you upload to Photos show here too.',
      }}
    />
  );
}
