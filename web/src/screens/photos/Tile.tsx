import type { ItemView } from '@cloudbox/core';
import { createContext, useContext, type KeyboardEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { CheckIcon, FileIcon, PlayIcon } from '../../app/icons.tsx';
import { scopeParam, type Scope } from '../../app/albums.ts';
import { useThumb } from '../../app/thumbs.ts';
import { isVideo } from '../../app/timeline.ts';

/** "1:15", "1:02:03". */
export function durationText(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** The file's type in capitals from its name, e.g. "HEIC", for a tile with no picture. */
function typeText(item: ItemView): string {
  const ext = item.meta?.name.split('.').pop();
  return ext && ext !== item.meta?.name ? ext.slice(0, 5).toUpperCase() : '';
}

export function TileMedia({ item }: { item: ItemView }) {
  const { url, missing } = useThumb(item);
  const hasThumb = !!item.blobs.thumb && !!item.meta?.thumbMime && !missing;
  return (
    <>
      {url ? (
        <img className="tile__img" src={url} alt="" draggable={false} />
      ) : !hasThumb ? (
        <span className="tile__file">
          <FileIcon size={28} />
          <span>{typeText(item)}</span>
        </span>
      ) : null}
      {isVideo(item) && (
        <span className="tile__video">
          <PlayIcon size={16} />
          {item.meta?.durationMs != null && <span>{durationText(item.meta.durationMs)}</span>}
        </span>
      )}
    </>
  );
}

/**
 * Which photos the viewer walks through when a tile is opened: an album,
 * Favourites or Videos set this around their timeline. Photos needs none.
 */
export const TileScope = createContext<Scope>({ kind: 'all' });

/** The viewer's search string: the page's own (the grouping) plus the scope. */
export function viewerSearch(search: string, scope: Scope): string {
  const params = new URLSearchParams(search);
  const v = scopeParam(scope);
  if (v) params.set('in', v);
  else params.delete('in');
  const s = params.toString();
  return s ? `?${s}` : '';
}

export type TileProps = {
  item: ItemView;
  label: string;
  tabIndex: 0 | -1;
  onKeyDown(e: KeyboardEvent<HTMLElement>): void;
  onFocus(): void;
  /** In Select mode: whether it is ticked, and how to toggle it. */
  select?: { checked: boolean; onToggle(): void } | undefined;
};

/** A photo in the timeline: a link to the viewer, or a checkbox in Select mode. */
export function Tile({ item, label, tabIndex, onKeyDown, onFocus, select }: TileProps) {
  const { search } = useLocation();
  const scope = useContext(TileScope);
  if (select) {
    return (
      <label className={`tile tile--select${select.checked ? ' tile--checked' : ''}`}>
        <input
          type="checkbox"
          className="tile__input"
          aria-label={label}
          checked={select.checked}
          onChange={select.onToggle}
          tabIndex={tabIndex}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
        />
        <TileMedia item={item} />
        <span className="tile__check" aria-hidden="true">
          {select.checked && <CheckIcon size={18} />}
        </span>
      </label>
    );
  }
  return (
    <Link
      className="tile"
      to={`/photos/${item.id}${viewerSearch(search, scope)}`}
      aria-label={label}
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      data-item={item.id}
    >
      <TileMedia item={item} />
    </Link>
  );
}
