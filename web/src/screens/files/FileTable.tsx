import type { ItemView } from '@cloudbox/core';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Link } from 'react-router';
import { entryName, type FileEntry } from '../../app/files.ts';
import { bytesText } from '../../app/format.ts';
import { FileIcon, FilesIcon, MoreIcon } from '../../app/icons.tsx';
import { useThumb } from '../../app/thumbs.ts';

export type FileAction = 'download' | 'rename' | 'move' | 'delete';

export type FileRow = {
  entry: FileEntry;
  /** Set on search results: the folder it is in, `Files › Taxes`. */
  where?: string | undefined;
};

export type FileTableProps = {
  rows: FileRow[];
  /** Whether a folder has nothing in it, so it can be deleted. */
  isEmpty(folderId: string): boolean;
  /** A file's name was clicked: open it in a tab or download it. */
  onOpen(entry: FileEntry): void;
  onAction(action: FileAction, entry: FileEntry): void;
};

export const entryKey = (e: FileEntry) => (e.kind === 'folder' ? e.folder.id : e.item.id);

/** What a row is called, also when its name can't be read. */
export function shownName(e: FileEntry): string {
  return (
    entryName(e) ?? (e.kind === 'folder' ? "Folder that can't be read" : "File that can't be read")
  );
}

export const filesText = (n: number) => (n === 1 ? '1 file' : `${n.toLocaleString()} files`);

function modifiedText(e: FileEntry): string {
  if (e.kind === 'folder') return '';
  const t = Date.parse(e.item.meta?.modifiedAt ?? '');
  if (!t) return '';
  return new Date(t).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function sizeText(e: FileEntry): string {
  if (e.kind === 'folder')
    return e.files === 0 && e.folders > 0
      ? e.folders === 1
        ? '1 folder'
        : `${e.folders.toLocaleString()} folders`
      : filesText(e.files);
  const n = e.item.meta?.size;
  return n === undefined ? '' : bytesText(n);
}

/** PDF, DOCX, JPG: the end of the name, as the chip shows it. */
function typeLabel(e: FileEntry): string | null {
  const name = entryName(e);
  const dot = name?.lastIndexOf('.') ?? -1;
  if (!name || dot <= 0) return null;
  const ext = name.slice(dot + 1);
  return /^[a-z0-9]{1,4}$/i.test(ext) ? ext.toUpperCase() : null;
}

/** A photo's own decrypted thumbnail; its type label until one is ready. */
function PhotoChip({ item, fallback }: { item: ItemView; fallback: ReactNode }) {
  const { url } = useThumb(item);
  if (!url) return fallback;
  return (
    <span className="file-chip file-chip--photo" aria-hidden="true">
      <img src={url} alt="" draggable={false} />
    </span>
  );
}

function Chip({ entry }: { entry: FileEntry }) {
  if (entry.kind === 'file' && entry.item.blobs.thumb && entry.item.meta?.thumbMime)
    return <PhotoChip item={entry.item} fallback={<TypeChip entry={entry} />} />;
  return <TypeChip entry={entry} />;
}

function TypeChip({ entry }: { entry: FileEntry }) {
  const label = entry.kind === 'file' ? typeLabel(entry) : null;
  return (
    <span
      className={`file-chip${entry.kind === 'folder' ? ' file-chip--folder' : ''}${(label?.length ?? 0) > 3 ? ' file-chip--long' : ''}`}
      aria-hidden="true"
    >
      {entry.kind === 'folder' ? <FilesIcon size={20} /> : label ? label : <FileIcon size={20} />}
    </span>
  );
}

/**
 * The folders and files in a folder (or found by a search). On wide screens
 * a table of Name, Modified and Size; under 720 px the same rows stack, with
 * `Modified · Size` under the name. Each row ends with its options menu.
 */
export function FileTable({ rows, isEmpty, onOpen, onAction }: FileTableProps) {
  return (
    <table className="file-table">
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col" className="file-table__meta">
            Modified
          </th>
          <th scope="col" className="file-table__meta file-table__size">
            Size
          </th>
          <th scope="col">
            <span className="visually-hidden">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ entry, where }) => {
          const name = shownName(entry);
          const modified = modifiedText(entry);
          const size = sizeText(entry);
          return (
            <tr key={entryKey(entry)} data-row={entryKey(entry)}>
              <td className="file-table__name">
                <div className="file-name">
                  <Chip entry={entry} />
                  <div className="file-name__text">
                    {entry.kind === 'folder' ? (
                      <Link to={`/files/${entry.folder.id}`} className="file-name__open">
                        {name}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="file-name__open"
                        onClick={() => onOpen(entry)}
                      >
                        {name}
                      </button>
                    )}
                    <span className="file-name__sub">
                      {modified && <span>{modified}</span>}
                      {modified && size && ' '}
                      {size && <span>{modified ? `· ${size}` : size}</span>}
                    </span>
                    {where && <span className="file-name__where">In {where}</span>}
                  </div>
                </div>
              </td>
              <td className="file-table__meta">{modified}</td>
              <td className="file-table__meta file-table__size">{size}</td>
              <td className="file-table__more">
                <RowMenu
                  name={name}
                  items={
                    entry.kind === 'folder'
                      ? [
                          { label: 'Rename', run: () => onAction('rename', entry) },
                          isEmpty(entry.folder.id)
                            ? {
                                label: 'Delete',
                                last: true,
                                run: () => onAction('delete', entry),
                              }
                            : {
                                label: "Folder isn't empty",
                                last: true,
                                reason: 'Move or delete what is in it first.',
                              },
                        ]
                      : [
                          { label: 'Download', run: () => onAction('download', entry) },
                          { label: 'Move to…', run: () => onAction('move', entry) },
                          { label: 'Delete', last: true, run: () => onAction('delete', entry) },
                        ]
                  }
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

type MenuItem = { label: string; last?: boolean; run?: () => void; reason?: string };

/**
 * A "More options for {name}" button and its menu: focus goes to the first
 * item, arrows move, Esc (or Tab, or a click elsewhere) closes it and puts
 * focus back on the button. A disabled item stays focusable and says why.
 */
function RowMenu({ name, items }: { name: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  const entries = () => [
    ...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
  ];

  useLayoutEffect(() => {
    if (!open) return;
    entries()[0]?.focus();
    const box = wrap.current?.getBoundingClientRect();
    const height = menu.current?.parentElement?.offsetHeight ?? 0;
    setAbove(!!box && box.bottom + height > window.innerHeight && box.top > height);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  const keys = (e: KeyboardEvent) => {
    const all = entries();
    const at = all.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => all[(i + all.length) % all.length]?.focus();
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(all.length - 1);
    else if (e.key === 'Escape') close(true);
    else if (e.key === 'Tab') close(false);
    else return;
    if (e.key !== 'Tab') e.preventDefault();
  };

  const why = items.find((i) => i.reason);
  return (
    <div className="row-menu" ref={wrap}>
      <button
        ref={button}
        type="button"
        className="icon-button"
        aria-label={`More options for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreIcon />
      </button>
      {open && (
        <div className={`row-menu__pop${above ? ' row-menu__pop--above' : ''}`}>
          <div
            ref={menu}
            id={id}
            role="menu"
            tabIndex={-1}
            aria-label={`Options for ${name}`}
            onKeyDown={keys}
          >
            {items.map((item) => {
              const reasonId = item.reason ? `${id}-why` : undefined;
              return (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  className={`row-menu__item${item.last ? ' row-menu__item--last' : ''}`}
                  aria-disabled={item.run ? undefined : true}
                  aria-describedby={reasonId}
                  onClick={() => {
                    if (!item.run) return;
                    close(true);
                    item.run();
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          {why && (
            <p id={`${id}-why`} className="row-menu__reason">
              {why.reason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
