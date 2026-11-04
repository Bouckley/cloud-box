import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  albumName,
  countText,
  type AlbumEntry,
  type AlbumHome,
  type AlbumTarget,
} from '../../app/albums.ts';
import { Dialog } from '../../app/Dialog.tsx';
import { AlbumsIcon } from '../../app/icons.tsx';
import { Choice, Field, FieldError } from '../forms.tsx';
import { TileMedia } from '../photos/Tile.tsx';
import { MoveSummary } from './MoveSummary.tsx';
import { NAME_NEEDED } from './NewAlbumDialog.tsx';

export type AlbumPickerProps = {
  /** The albums to offer, in order. */
  albums: AlbumEntry[];
  /** How many photos are being added. */
  count: number;
  /** The user's albums holding some of them now, most first (adding moves them: S6). */
  homes: AlbumHome[];
  /** How many of them are only in Photos. */
  onlyInPhotos: number;
  /** Adds them; the picker closes when it resolves. */
  onAdd(target: AlbumTarget): Promise<void>;
  onClose(): void;
  returnFocus?: (() => HTMLElement | null) | undefined;
};

const NEW = '';

/** A small cover beside each album's name: its newest photo, or the album icon. */
function Cover({ entry }: { entry: AlbumEntry }) {
  return (
    <span className="choice__cover" aria-hidden="true">
      {entry.cover ? <TileMedia item={entry.cover} /> : <AlbumsIcon size={20} />}
    </span>
  );
}

/**
 * `Add to album`: the user's albums plus `New album`. An item lives in one
 * album, so when a photo would leave another album the picker first shows the
 * move (Leaving → Moving to) and asks; Cancel goes back to the list.
 */
export function AlbumPicker({
  albums,
  count,
  homes,
  onlyInPhotos,
  onAdd,
  onClose,
  returnFocus,
}: AlbumPickerProps) {
  const group = useId();
  const [chosen, setChosen] = useState(albums[0]?.album.id ?? NEW);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  // The move being confirmed; null while choosing.
  const [move, setMove] = useState<{ target: AlbumTarget; leaving: AlbumHome[] } | null>(null);
  const first = useRef<HTMLInputElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const radios = useRef<HTMLFieldSetElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const confirming = move !== null;
  const them = count === 1 ? 'it' : 'them';

  // Dialog focuses only when it opens, so each step change moves focus here:
  // into the question on Cancel, back to what they chose on return.
  const back = useRef(false);
  useEffect(() => {
    if (confirming) cancel.current?.focus();
    else if (back.current) {
      if (chosen === NEW) field.current?.focus();
      else radios.current?.querySelector<HTMLInputElement>('input:checked')?.focus();
    }
    back.current = confirming;
  }, [confirming, chosen]);

  const run = async (target: AlbumTarget) => {
    setBusy(true);
    setFailed(false);
    try {
      await onAdd(target);
      onClose();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (move) return run(move.target);
    let target: AlbumTarget;
    if (chosen === NEW) {
      const trimmed = name.trim();
      if (!trimmed) {
        setProblem(NAME_NEEDED);
        field.current?.focus();
        return;
      }
      target = { newName: trimmed };
    } else {
      const entry = albums.find((a) => a.album.id === chosen)!;
      target = { id: chosen, name: albumName(entry.album) };
    }
    const leaving = homes.filter((h) => h.entry.album.id !== chosen);
    if (leaving.length) setMove({ target, leaving });
    else await run(target);
  };

  const moving = move ? move.leaving.reduce((n, h) => n + h.count, 0) : 0;

  return (
    <Dialog
      title={
        !move
          ? 'Add to album'
          : moving === 1
            ? 'Move this photo?'
            : `Move ${moving.toLocaleString()} photos?`
      }
      initialFocus={albums.length ? first : field}
      onClose={onClose}
      busy={busy}
      returnFocus={returnFocus}
      className="sheet picker"
    >
      <form className="dialog__form" onSubmit={(e) => void add(e)} noValidate>
        {move ? (
          <>
            <p className="sheet__lede">
              {moving === 1
                ? 'A photo lives in one album, so it will only be in the new one.'
                : 'A photo lives in one album, so these will only be in the new one.'}
            </p>
            <MoveSummary
              leaving={move.leaving}
              target={
                'id' in move.target
                  ? {
                      entry: albums.find((a) => a.album.id === chosen) ?? null,
                      name: move.target.name,
                    }
                  : { entry: null, name: move.target.newName }
              }
              incoming={moving + onlyInPhotos}
              fromPhotos={onlyInPhotos}
            />
          </>
        ) : (
          <>
            <fieldset ref={radios} className="choices picker__list">
              <legend className="visually-hidden">Albums</legend>
              {albums.map((entry, i) => (
                <Choice
                  key={entry.album.id}
                  ref={i === 0 ? first : undefined}
                  name={group}
                  value={entry.album.id}
                  checked={chosen === entry.album.id}
                  label={albumName(entry.album)}
                  detail={countText(entry.count)}
                  media={<Cover entry={entry} />}
                  disabled={busy}
                  onChoose={() => setChosen(entry.album.id)}
                />
              ))}
              <Choice
                name={group}
                value="new"
                checked={chosen === NEW}
                label="New album"
                media={
                  <span className="choice__cover choice__cover--new" aria-hidden="true">
                    <AlbumsIcon size={20} />
                  </span>
                }
                disabled={busy}
                onChoose={() => {
                  setChosen(NEW);
                  // Let the field appear, then type straight into it.
                  requestAnimationFrame(() => field.current?.focus());
                }}
              />
            </fieldset>
            {chosen === NEW && (
              <Field
                ref={field}
                label="Album name"
                value={name}
                maxLength={255}
                autoComplete="off"
                error={problem || undefined}
                readOnly={busy}
                onChange={(e) => {
                  setName(e.target.value);
                  setProblem('');
                }}
              />
            )}
          </>
        )}
        {failed && <FieldError>Couldn&apos;t add {them} to the album. Try again.</FieldError>}
        <div className="dialog__actions">
          <button
            ref={cancel}
            type="button"
            className="button"
            onClick={() => {
              if (!move) return onClose();
              setMove(null);
              setFailed(false);
            }}
            disabled={busy}
          >
            Cancel
          </button>
          <button type="submit" className="button button--primary" disabled={busy}>
            {!move
              ? busy
                ? 'Adding…'
                : 'Add'
              : busy
                ? 'Moving…'
                : moving === 1
                  ? 'Move photo'
                  : 'Move photos'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
