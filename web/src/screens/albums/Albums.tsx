import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { albumList, albumName, countText, type AlbumEntry } from '../../app/albums.ts';
import {
  AlbumsIcon,
  ChevronIcon,
  HeartIcon,
  PlusIcon,
  TrashIcon,
  VideoIcon,
} from '../../app/icons.tsx';
import { useLibrary } from '../../app/session.tsx';
import { useTitle } from '../../app/title.ts';
import { TileMedia } from '../photos/Tile.tsx';
import { NewAlbumDialog } from './NewAlbumDialog.tsx';

/** An album on the shelf: its newest photo as the cover, the name and count under it. */
function AlbumCard({ entry }: { entry: AlbumEntry }) {
  return (
    <li>
      <Link to={`/albums/${entry.album.id}`} className="album-card">
        <span className="album-card__cover" aria-hidden="true">
          {entry.cover ? <TileMedia item={entry.cover} /> : <AlbumsIcon size={32} />}
        </span>
        <span className="album-card__name">{albumName(entry.album)}</span>
        <span className="album-card__count">{countText(entry.count)}</span>
      </Link>
    </li>
  );
}

/** `/albums`: the user's albums, New album, and the way to Favourites, Videos and Trash. */
export function AlbumsScreen() {
  useTitle('Albums');
  const { library, snapshot } = useLibrary();
  const navigate = useNavigate();
  const albums = useMemo(() => albumList(snapshot), [snapshot]);
  const [creating, setCreating] = useState(false);
  const newButton = useRef<HTMLButtonElement>(null);
  const ready = snapshot.syncedAt !== null;
  let trashed = 0;
  for (const item of snapshot.items.values()) if (item.trashedAt) trashed++;

  return (
    <>
      <header className="screen-header">
        <h1>Albums</h1>
        <button
          ref={newButton}
          type="button"
          className="button button--primary"
          disabled={!library || !ready}
          onClick={() => setCreating(true)}
        >
          <PlusIcon size={18} />
          New album
        </button>
      </header>

      {!ready ? (
        <p className="waiting" aria-live="polite">
          Opening your albums…
        </p>
      ) : albums.length === 0 ? (
        <div className="empty">
          <AlbumsIcon size={40} />
          <h2>No albums yet</h2>
          <p>Make one with New album, then add photos to it from Photos.</p>
        </div>
      ) : (
        <section className="albums" aria-labelledby="my-albums">
          <h2 id="my-albums">My albums</h2>
          <ul className="album-grid">
            {albums.map((entry) => (
              <AlbumCard key={entry.album.id} entry={entry} />
            ))}
          </ul>
        </section>
      )}

      <section className="albums" aria-labelledby="more">
        <h2 id="more">More</h2>
        <nav aria-labelledby="more" className="more-links">
          <Link to="/albums/favourites" className="more-link">
            <HeartIcon size={22} />
            <span>Favourites</span>
            <ChevronIcon size={20} />
          </Link>
          <Link to="/albums/videos" className="more-link">
            <VideoIcon size={22} />
            <span>Videos</span>
            <ChevronIcon size={20} />
          </Link>
          <Link to="/trash" className="more-link">
            <TrashIcon size={22} />
            <span>
              Trash · <span className="more-link__count">{trashed.toLocaleString()}</span>
            </span>
            <ChevronIcon size={20} />
          </Link>
        </nav>
      </section>

      {creating && library && (
        <NewAlbumDialog
          onSave={async (name) => {
            const id = await library.createCollection('album', name);
            void navigate(`/albums/${id}`);
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}
