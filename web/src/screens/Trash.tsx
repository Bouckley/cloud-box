import type { ItemView, TrashView } from '@cloudbox/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog } from '../app/Dialog.tsx';
import { RestoreIcon, TrashIcon } from '../app/icons.tsx';
import { useLibrary, useStatus } from '../app/session.tsx';
import { useTitle } from '../app/title.ts';
import { FieldError } from './forms.tsx';
import { TileMedia } from './photos/Tile.tsx';

const nameOf = (item: ItemView) => item.meta?.name ?? "Item that can't be read";

export function daysLeftText(n: number): string {
  if (n <= 0) return 'Less than a day left';
  return n === 1 ? '1 day left' : `${n} days left`;
}

/** `failure` is what the page says if the delete does not finish. */
type Confirm = { ids: string[]; title: string; detail: string; failure: string };

export type TrashListProps = {
  items: TrashView[];
  onRestore(id: string): Promise<void>;
  onDeleteForever(ids: string[]): Promise<void>;
  /** Set when the list could not be read again after a change: it may be out of date. */
  stale?: boolean | undefined;
};

/** The Trash screen's content: header with Empty Trash, then the rows. */
export function TrashList({ items, onRestore, onDeleteForever, stale }: TrashListProps) {
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [said, setSaid] = useState('');
  const [failed, setFailed] = useState('');
  const [restoring, setRestoring] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // After a row goes, focus moves to the row that took its place (or the
  // heading), so keyboard and screen reader users keep their place.
  const focusNext = useRef<string | null>(null);

  const after = (id: string) => {
    const i = items.findIndex((t) => t.item.id === id);
    return (items[i + 1] ?? items[i - 1])?.item.id ?? '';
  };

  useEffect(() => {
    const want = focusNext.current;
    if (want === null) return;
    const btn = want
      ? listRef.current?.querySelector<HTMLElement>(`[data-restore="${CSS.escape(want)}"]`)
      : null;
    (btn ?? heading.current)?.focus();
    focusNext.current = null;
  });

  const restore = async (item: ItemView) => {
    setRestoring(item.id);
    setFailed('');
    const next = after(item.id);
    try {
      await onRestore(item.id);
      setSaid(`Restored ${nameOf(item)}`);
      focusNext.current = next;
    } catch {
      setSaid('');
      setFailed(`Couldn't restore ${nameOf(item)}. Try again.`);
      // The button was disabled while it worked, which drops focus: put it back.
      focusNext.current = item.id;
    } finally {
      setRestoring(null);
    }
  };

  const deleteForever = async (c: Confirm) => {
    setFailed('');
    const next = c.ids.length === 1 ? after(c.ids[0]!) : '';
    try {
      await onDeleteForever(c.ids);
      // A line about an earlier restore would no longer describe the list.
      setSaid('');
      focusNext.current = next;
    } catch {
      setSaid('');
      setFailed(c.failure);
    }
  };

  return (
    <>
      <header className="screen-header">
        <h1 ref={heading} tabIndex={-1}>
          Trash
        </h1>
        {items.length > 0 && (
          <button
            type="button"
            className="button button--quiet-danger"
            onClick={() =>
              setConfirm({
                ids: items.map((t) => t.item.id),
                title: 'Empty Trash?',
                detail: `Delete ${items.length.toLocaleString()} ${
                  items.length === 1 ? 'item' : 'items'
                } forever? This can't be undone.`,
                failure: "Couldn't empty Trash. Check the list, then try again.",
              })
            }
          >
            <TrashIcon size={18} />
            Empty Trash
          </button>
        )}
      </header>
      <p className="screen-said" role="status">
        {said}
      </p>
      {failed && <FieldError>{failed}</FieldError>}
      {stale && (
        <FieldError>
          This list may be out of date. Reload the page to see Trash as it is now.
        </FieldError>
      )}
      {items.length === 0 ? (
        <div className="empty">
          <TrashIcon size={40} />
          <h2>Trash is empty</h2>
          <p>Photos and files you delete wait here for 30 days, then your box removes them.</p>
        </div>
      ) : (
        <ul ref={listRef} className="trash-list card">
          {items.map(({ item, daysLeft }) => {
            const name = nameOf(item);
            return (
              <li key={item.id} className="trash-row">
                <span className="trash-row__thumb">
                  <TileMedia item={item} />
                </span>
                <span className="trash-row__text">
                  <span className="trash-row__name">{name}</span>
                  <span className="trash-row__left">{daysLeftText(daysLeft)}</span>
                </span>
                <span className="trash-row__actions">
                  <button
                    type="button"
                    className="button"
                    aria-label={`Restore ${name}`}
                    data-restore={item.id}
                    disabled={restoring === item.id}
                    onClick={() => void restore(item)}
                  >
                    <RestoreIcon size={18} />
                    {restoring === item.id ? 'Restoring…' : 'Restore'}
                  </button>
                  <button
                    type="button"
                    className="button button--quiet-danger"
                    aria-label={`Delete forever ${name}`}
                    onClick={() =>
                      setConfirm({
                        ids: [item.id],
                        title: "Delete forever? This can't be undone.",
                        detail: name,
                        failure: `Couldn't delete ${name} forever. Try again.`,
                      })
                    }
                  >
                    Delete forever
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {confirm && (
        <ConfirmForever
          title={confirm.title}
          detail={confirm.detail}
          onConfirm={() => deleteForever(confirm)}
          onClose={() => setConfirm(null)}
          returnFocus={() => heading.current}
        />
      )}
    </>
  );
}

/**
 * The second, plain question before anything is deleted for good. It closes
 * when the delete settles; a failure is told on the page, with the list read
 * again, so a retry starts from what is really in Trash.
 */
function ConfirmForever({
  title,
  detail,
  onConfirm,
  onClose,
  returnFocus,
}: {
  title: string;
  detail: string;
  onConfirm(): Promise<void>;
  onClose(): void;
  returnFocus(): HTMLElement | null;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    await onConfirm();
    onClose();
  };
  return (
    <Dialog
      title={title}
      initialFocus={cancel}
      onClose={onClose}
      busy={busy}
      returnFocus={returnFocus}
      className="sheet"
    >
      <p className="sheet__lede">{detail}</p>
      <div className="dialog__actions">
        <button ref={cancel} type="button" className="button" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="button button--danger"
          onClick={() => void go()}
          disabled={busy}
        >
          {busy ? 'Deleting…' : 'Delete forever'}
        </button>
      </div>
    </Dialog>
  );
}

/** `/trash`: what is waiting to be deleted, read from the box's Trash list. */
export function TrashScreen() {
  useTitle('Trash');
  const { library } = useLibrary();
  const { refresh: refreshStatus } = useStatus();
  const [items, setItems] = useState<TrashView[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!library) return;
    try {
      setItems(await library.trashList());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [library]);
  /** Runs an action, then always reads Trash again: after a partial failure too. */
  const thenReload = async (action: () => Promise<void>) => {
    try {
      await action();
    } finally {
      // The safety banner counts what is outside Trash: ask again now, not at the next poll.
      refreshStatus({ sync: false });
      await load();
    }
  };

  useEffect(() => {
    let live = true;
    library
      ?.trashList()
      .then((l) => live && setItems(l))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [library]);

  if (items) {
    return (
      <TrashList
        items={items}
        stale={failed}
        onRestore={(id) => thenReload(() => library!.restore([id]))}
        onDeleteForever={(ids) => thenReload(() => library!.deleteForever(ids))}
      />
    );
  }
  return (
    <>
      <header className="screen-header">
        <h1>Trash</h1>
      </header>
      {failed ? (
        <FieldError>Couldn&apos;t open Trash. Check your box is on, then reload.</FieldError>
      ) : (
        <p className="waiting" aria-live="polite">
          Opening Trash…
        </p>
      )}
    </>
  );
}
