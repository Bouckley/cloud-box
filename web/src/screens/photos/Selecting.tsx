import type { ItemView } from '@cloudbox/core';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { albumAdder, pickerChoices, type AlbumTarget } from '../../app/albums.ts';
import { AlbumsIcon, TrashIcon } from '../../app/icons.tsx';
import { useLibrary, useStatus } from '../../app/session.tsx';
import { AlbumPicker } from '../albums/AlbumPicker.tsx';
import { DeleteSheet } from '../DeleteSheet.tsx';

/** The album picker for some photos; `onAdded` hears the album's name once they are in it. */
export function AddToAlbum({
  ids,
  onAdded,
  onClose,
  returnFocus,
  from,
  around = (run) => run().then(() => {}),
}: {
  ids: string[];
  /** The album they're moved out of, when opened inside it (the picker says Move). */
  from?: string | undefined;
  onAdded(album: { id: string; name: string }): void;
  onClose(): void;
  returnFocus?: (() => HTMLElement | null) | undefined;
  /** Wraps the move, e.g. so the viewer can step on if the photo leaves its list. */
  around?: (run: () => Promise<{ id: string; name: string }>) => Promise<void>;
}) {
  const { library, snapshot } = useLibrary();
  // Read once when it opens: the list should not shift under the pointer.
  const [choices] = useState(() => pickerChoices(snapshot, ids, from));
  // One adder per picker, so a retry reuses an album it already made.
  const [add] = useState(() => (library ? albumAdder(library) : null));
  return (
    <AlbumPicker
      albums={choices.albums}
      count={ids.length}
      homes={choices.homes}
      onlyInPhotos={choices.onlyInPhotos}
      unmovable={choices.unmovable}
      from={from}
      onAdd={async (target: AlbumTarget) => {
        if (!add) throw new Error('locked');
        await around(async () => {
          const album = await add(ids, target);
          onAdded(album);
          return album;
        });
      }}
      onClose={onClose}
      returnFocus={returnFocus}
    />
  );
}

export type Selecting = {
  /** The Select button, for the header's tools. */
  button: ReactNode;
  /** What just happened ("Added to Garden"), then the select bar and its sheets. */
  bar: ReactNode;
  /** Spread onto the Timeline. */
  timeline: {
    selected: Set<string> | undefined;
    onToggle: ((id: string) => void) | undefined;
    onPick: (id: string) => void;
  };
};

/**
 * Select mode over a list of photos (Photos, an album, Favourites, Videos):
 * a Select button, a bar saying how many are chosen with Add (or Move) to album,
 * Delete and Cancel, and the picker and delete sheet those open.
 */
export function useSelecting(
  items: ItemView[],
  show = true,
  /** The album being shown: its photos move out (a photo is in one album), so say Move. */
  from?: string,
): Selecting {
  const verb = from === undefined ? 'add' : 'move';
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [deleting, setDeleting] = useState<string[] | null>(null);
  const [adding, setAdding] = useState<string[] | null>(null);
  const [said, setSaid] = useState('');
  const { library } = useLibrary();
  const { refresh: refreshStatus } = useStatus();
  const selectButton = useRef<HTMLButtonElement>(null);
  const present = useMemo(() => new Set(items.map((i) => i.id)), [items]);

  const toggle = useCallback((id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** The selected photos still here (one deleted on another device meanwhile is not). */
  const chosen = (then: (ids: string[]) => void) => {
    const ids = [...(selected ?? [])].filter((id) => present.has(id));
    if (ids.length > 0) then(ids);
    else setSelected(new Set());
  };

  const button = show && (
    <button
      ref={selectButton}
      type="button"
      className="button"
      aria-pressed={selected !== null}
      onClick={() => {
        setSaid('');
        setSelected((s) => (s ? null : new Set()));
      }}
    >
      Select
    </button>
  );

  const bar = (
    <>
      <p className="screen-said" role="status">
        {said}
      </p>
      {selected && (
        <div className="select-bar" role="region" aria-label="Selection">
          <p aria-live="polite">
            {selected.size === 0
              ? 'Choose photos'
              : selected.size === 1
                ? '1 selected'
                : `${selected.size} selected`}
          </p>
          <div className="select-bar__actions">
            <button
              type="button"
              className="button"
              disabled={selected.size === 0}
              onClick={() => chosen(setAdding)}
            >
              <AlbumsIcon size={18} />
              {verb === 'move' ? 'Move to album' : 'Add to album'}
            </button>
            <button
              type="button"
              className="button"
              disabled={selected.size === 0}
              onClick={() => chosen(setDeleting)}
            >
              <TrashIcon size={18} />
              Delete
            </button>
            <button type="button" className="button" onClick={() => setSelected(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {adding && (
        <AddToAlbum
          ids={adding}
          from={from}
          onAdded={(album) => {
            setSelected(null);
            setSaid(`${verb === 'move' ? 'Moved' : 'Added'} to ${album.name}`);
          }}
          onClose={() => setAdding(null)}
          returnFocus={() => selectButton.current}
        />
      )}
      {deleting && (
        <DeleteSheet
          what="photo"
          count={deleting.length}
          onConfirm={async () => {
            if (!library) throw new Error('locked');
            try {
              await library.trash(deleting.filter((id) => present.has(id)));
              setSelected(null);
            } finally {
              refreshStatus({ sync: false });
            }
          }}
          onClose={() => setDeleting(null)}
          returnFocus={() => selectButton.current}
        />
      )}
    </>
  );

  return {
    button,
    bar,
    timeline: {
      selected: selected ?? undefined,
      onToggle: selected ? toggle : undefined,
      onPick: toggle,
    },
  };
}
