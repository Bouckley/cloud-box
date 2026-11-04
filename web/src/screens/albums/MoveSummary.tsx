import { useId } from 'react';
import { albumName, countText, type AlbumEntry, type AlbumHome } from '../../app/albums.ts';
import { AlbumsIcon } from '../../app/icons.tsx';
import { TileMedia } from '../photos/Tile.tsx';

export type MoveSummaryProps = {
  /** The albums the photos leave, most first (never the target). */
  leaving: AlbumHome[];
  /** Where they go; `entry` is null for an album made in this step. */
  target: { entry: AlbumEntry | null; name: string };
  /** How many go in: those leaving plus those only in Photos. */
  incoming: number;
  /** How many of them are only in Photos now. */
  fromPhotos: number;
};

/** Up to four rows show as they are; past that, three and one row for the rest. */
const SHOWN = 4;

function Cover({ entry }: { entry: AlbumEntry | null }) {
  return (
    <span className="move__cover" aria-hidden="true">
      {entry?.cover ? <TileMedia item={entry.cover} /> : <AlbumsIcon size={22} />}
    </span>
  );
}

/**
 * The picture of a move between albums: where the photos leave (one row per
 * album, with how many), an arrow, and the album they go to. A photo lives in
 * one album (scope ruling S6), so this is what the user confirms.
 */
export function MoveSummary({ leaving, target, incoming, fromPhotos }: MoveSummaryProps) {
  const leavingId = useId();
  const toId = useId();
  const shown = leaving.length <= SHOWN ? leaving : leaving.slice(0, SHOWN - 1);
  const rest = leaving.slice(shown.length);
  const restCount = rest.reduce((n, h) => n + h.count, 0);
  const several = incoming > 1;
  return (
    <div className="move">
      <section className="move__leaving" aria-labelledby={leavingId}>
        <h3 id={leavingId} className="move__label">
          Leaving
        </h3>
        <ul className="move__rows">
          {shown.map((h) => (
            <li key={h.entry.album.id} className="move__row">
              <Cover entry={h.entry} />
              <span className="move__text">
                <span className="move__name">{albumName(h.entry.album)}</span>
                <span className="move__count">{countText(h.count)}</span>
              </span>
            </li>
          ))}
          {rest.length > 0 && (
            <li className="move__row">
              <span className="move__cover move__cover--more" aria-hidden="true">
                +{rest.length}
              </span>
              <span className="move__text">
                <span className="move__name">
                  {rest.length === 1 ? '1 more album' : `${rest.length} more albums`}
                </span>
                <span className="move__count">{countText(restCount)}</span>
              </span>
            </li>
          )}
        </ul>
      </section>
      <svg
        className="move__arrow"
        aria-hidden="true"
        width="30"
        height="30"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 4v15M6 13l6 6 6-6" />
      </svg>
      <section className="move__to" aria-labelledby={toId}>
        <Cover entry={target.entry} />
        <div className="move__text">
          <h3 id={toId} className="move__label">
            Moving to
          </h3>
          <span className="move__name">{target.name}</span>
          {several && (
            <span className="move__count">
              {countText(incoming)}
              {fromPhotos > 0 && ' in all'}
            </span>
          )}
        </div>
      </section>
      {fromPhotos > 0 && (
        <p className="move__note">
          {fromPhotos === 1
            ? '1 photo from Photos is added too.'
            : `${fromPhotos.toLocaleString()} photos from Photos are added too.`}
        </p>
      )}
    </div>
  );
}
