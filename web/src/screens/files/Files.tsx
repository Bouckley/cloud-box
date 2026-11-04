import type { ItemView, LibrarySnapshot } from '@cloudbox/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Dialog } from '../../app/Dialog.tsx';
import { DownloadTooBig, saveOriginal } from '../../app/download.ts';
import {
  allFolders,
  folderEntries,
  folderPath,
  isEmptyFolder,
  opensInTab,
  searchEntries,
  sortEntries,
  type FileEntry,
  type SortBy,
} from '../../app/files.ts';
import { CloseIcon, FilesIcon, FolderPlusIcon, SearchIcon, UploadIcon } from '../../app/icons.tsx';
import { useLibrary, useStatus } from '../../app/session.tsx';
import { useTitle } from '../../app/title.ts';
import { useUploads } from '../../app/uploads.ts';
import { fileSource } from '../../platform/media.ts';
import { DeleteSheet } from '../DeleteSheet.tsx';
import { FieldError } from '../forms.tsx';
import { Uploads } from '../photos/Photos.tsx';
import { FileDetails } from './FileDetails.tsx';
import { FileViewer } from './FileViewer.tsx';
import { FileTable, entryKey, shownName, type FileAction } from './FileTable.tsx';
import { MovePicker } from './MovePicker.tsx';
import { NewFolderDialog } from './NewFolderDialog.tsx';
import { UploadSheet } from './UploadSheet.tsx';

type Open =
  | { kind: 'upload' }
  | { kind: 'new' }
  | { kind: 'rename'; entry: Extract<FileEntry, { kind: 'folder' }> }
  | { kind: 'details'; entry: Extract<FileEntry, { kind: 'file' }> }
  | { kind: 'move'; entry: Extract<FileEntry, { kind: 'file' }> }
  | { kind: 'delete-file'; entry: Extract<FileEntry, { kind: 'file' }> }
  | { kind: 'delete-folder'; entry: Extract<FileEntry, { kind: 'folder' }> };

const SORTS: { by: SortBy; label: string }[] = [
  { by: 'name', label: 'Sort: Name' },
  { by: 'modified', label: 'Sort: Modified' },
  { by: 'size', label: 'Sort: Size' },
];

/** `Files › Taxes`: where a folder is, in words. */
export const pathText = (snapshot: LibrarySnapshot, folderId: string) =>
  folderPath(snapshot, folderId)
    .map((c) => c.name ?? "Folder that can't be read")
    .join(' › ');

/** A row's menu button, to give focus back to; null once the row has gone. */
const rowButton = (entry: FileEntry) =>
  document.querySelector<HTMLElement>(`[data-row="${CSS.escape(entryKey(entry))}"] .icon-button`);

/** Files (`/files`) and one folder (`/files/:folderId`). */
export function FilesScreen() {
  const { folderId: param } = useParams();
  const { library, snapshot } = useLibrary();
  const { refresh } = useStatus();
  const { queue } = useUploads();
  const ready = snapshot.syncedAt !== null;
  const folderId = param ?? (library && ready ? library.roots().files : '');
  const path = useMemo(() => folderPath(snapshot, folderId), [snapshot, folderId]);
  const here = path.at(-1);
  const hereName = here?.name ?? "Folder that can't be read";
  useTitle(param ? (here?.name ?? 'Files') : 'Files');

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortBy>('name');
  const [open, setOpen] = useState<Open | null>(null);
  const [said, setSaid] = useState('');
  const [problem, setProblem] = useState('');
  const uploadButton = useRef<HTMLButtonElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);

  // Back from a file: focus its name again, so keyboard users keep their place.
  const back = (useLocation().state as { focus?: string } | null)?.focus;
  useEffect(() => {
    if (!back || !ready) return;
    document
      .querySelector<HTMLElement>(`[data-row="${CSS.escape(back)}"] .file-name__open`)
      ?.focus();
  }, [back, ready]);

  const searching = query.trim() !== '';
  const rows = useMemo(() => {
    if (!here) return [];
    if (searching)
      return searchEntries(snapshot, here.id, query).map(({ entry, folderId: at }) => ({
        entry,
        where: pathText(snapshot, at),
      }));
    return sortEntries(folderEntries(snapshot, here.id), sort).map((entry) => ({ entry }));
  }, [snapshot, here, searching, query, sort]);
  const folders = useMemo(() => allFolders(snapshot), [snapshot]);

  // Say how many were found once typing settles, for people who can't see the rows.
  const [found, setFound] = useState('');
  const count = searching ? rows.length : -1;
  useEffect(() => {
    if (count < 0) return;
    const t = setTimeout(
      () => setFound(count === 1 ? '1 found' : `${count.toLocaleString()} found`),
      500,
    );
    return () => clearTimeout(t);
  }, [count, query]);
  const clearSearch = () => {
    setQuery('');
    searchBox.current?.focus();
  };

  const tell = (words: string) => {
    setProblem('');
    setSaid(words);
  };
  const fail = (words: string) => {
    setSaid('');
    setProblem(words);
  };

  const download = async (entry: Extract<FileEntry, { kind: 'file' }>) => {
    if (!library) return;
    const name = shownName(entry);
    tell(`Downloading ${name}…`);
    try {
      await saveOriginal(library, entry.item);
      tell('');
    } catch (e) {
      fail(e instanceof DownloadTooBig ? e.message : `Couldn't download ${name}. Try again.`);
    }
  };

  // Photos and PDFs open inside Cloud Box; anything else shows its details.
  const navigate = useNavigate();
  const openFile = (entry: Extract<FileEntry, { kind: 'file' }>) => {
    if (opensInTab(entry.item.meta?.mime ?? '')) void navigate(`/files/open/${entry.item.id}`);
    else setOpen({ kind: 'details', entry });
  };

  const act = (action: FileAction, entry: FileEntry) => {
    if (entry.kind === 'file') {
      if (action === 'download') void download(entry);
      if (action === 'move') setOpen({ kind: 'move', entry });
      if (action === 'delete') setOpen({ kind: 'delete-file', entry });
    } else {
      if (action === 'rename') setOpen({ kind: 'rename', entry });
      if (action === 'delete') setOpen({ kind: 'delete-folder', entry });
    }
  };

  if (ready && !here) {
    return (
      <div className="empty">
        <FilesIcon size={40} />
        <h1>This folder isn&apos;t here any more</h1>
        <p>
          <Link to="/files">Back to Files</Link>
        </p>
      </div>
    );
  }

  return (
    <>
      <header className="screen-header files-header">
        <nav aria-label="Breadcrumb" className="crumbs">
          <ol>
            {path.map((c, i) => {
              const name = c.name ?? "Folder that can't be read";
              return i < path.length - 1 ? (
                <li key={c.id}>
                  <Link to={c.role === 'files' ? '/files' : `/files/${c.id}`}>{name}</Link>
                  <span aria-hidden="true"> › </span>
                </li>
              ) : (
                <li key={c.id}>
                  <h1 aria-current="page">{name}</h1>
                </li>
              );
            })}
            {!here && (
              <li>
                <h1 aria-current="page">Files</h1>
              </li>
            )}
          </ol>
        </nav>
        <button
          ref={uploadButton}
          type="button"
          className="button button--primary"
          disabled={!queue || !here}
          onClick={() => setOpen({ kind: 'upload' })}
        >
          <UploadIcon size={18} />
          Upload to {here ? hereName : 'Files'}
        </button>
      </header>

      <div className="files-tools">
        <div className="search-field">
          <SearchIcon size={20} />
          <label className="visually-hidden" htmlFor="files-search">
            Search files
          </label>
          <input
            ref={searchBox}
            id="files-search"
            type="search"
            placeholder="Search files"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="icon-button search-field__clear"
              aria-label="Clear search"
              onClick={clearSearch}
            >
              <CloseIcon size={20} />
            </button>
          )}
        </div>
        <button
          type="button"
          className="button"
          disabled={!here}
          onClick={() => setOpen({ kind: 'new' })}
        >
          <FolderPlusIcon size={18} />
          New folder
        </button>
        <select
          className="button files-sort"
          aria-label="Sort"
          value={sort}
          disabled={searching}
          onChange={(e) => setSort(e.target.value as SortBy)}
        >
          {SORTS.map((s) => (
            <option key={s.by} value={s.by}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <p className="screen-said" role="status">
        {said || (searching ? found : '')}
      </p>
      {problem && <FieldError>{problem}</FieldError>}

      <Uploads />

      {!ready ? (
        <p className="waiting" aria-live="polite">
          Opening your files…
        </p>
      ) : rows.length === 0 ? (
        <div className="empty">
          {searching ? <SearchIcon size={40} /> : <FilesIcon size={40} />}
          {searching ? (
            <>
              <h2>No files called &quot;{query.trim()}&quot;</h2>
              <p>
                <button type="button" className="button" onClick={clearSearch}>
                  Clear search
                </button>
              </p>
            </>
          ) : here?.role === 'files' ? (
            <>
              <h2>No files yet</h2>
              <p>Papers you upload are locked on this computer before they go to your box.</p>
            </>
          ) : (
            <>
              <h2>This folder is empty</h2>
              <p>Upload files to it, or move some here.</p>
            </>
          )}
        </div>
      ) : (
        <div className="file-card">
          <FileTable
            rows={rows}
            isEmpty={(id) => isEmptyFolder(snapshot, id)}
            onOpen={(entry) => {
              if (entry.kind === 'file') openFile(entry);
            }}
            onAction={act}
          />
        </div>
      )}

      {open?.kind === 'upload' && here && (
        <UploadSheet
          folders={folders}
          folderId={here.id}
          onChoose={(files, to) => queue?.add(files.map(fileSource), to)}
          onClose={() => setOpen(null)}
        />
      )}
      {open?.kind === 'new' && here && library && (
        <NewFolderDialog
          onSave={async (name) => {
            await library.createCollection('folder', name, here.id);
          }}
          onClose={() => setOpen(null)}
        />
      )}
      {open?.kind === 'rename' && library && (
        <NewFolderDialog
          current={open.entry.folder.name ?? ''}
          onSave={(name) => library.renameCollection(open.entry.folder.id, name)}
          onClose={() => setOpen(null)}
        />
      )}
      {open?.kind === 'move' && library && (
        <MovePicker
          name={shownName(open.entry)}
          folders={folders}
          hereId={open.entry.item.collectionId}
          onMove={async (to) => {
            await library.move([open.entry.item.id], to);
            const f = folders.find((x) => x.folder.id === to);
            tell(`Moved to ${f?.folder.name ?? 'the folder'}`);
          }}
          onClose={() => setOpen(null)}
          returnFocus={() => rowButton(open.entry) ?? uploadButton.current}
        />
      )}
      {open?.kind === 'details' && library && (
        <FileDetails
          item={open.entry.item}
          where={pathText(snapshot, open.entry.item.collectionId)}
          onDownload={() => saveOriginal(library, open.entry.item)}
          onMove={() => setOpen({ kind: 'move', entry: open.entry })}
          onDelete={() => setOpen({ kind: 'delete-file', entry: open.entry })}
          onClose={() => setOpen(null)}
          returnFocus={() => rowButton(open.entry) ?? uploadButton.current}
        />
      )}
      {open?.kind === 'delete-file' && library && (
        <DeleteSheet
          what="file"
          count={1}
          onConfirm={async () => {
            try {
              await library.trash([open.entry.item.id]);
            } finally {
              refresh({ sync: false });
            }
          }}
          onClose={() => setOpen(null)}
          returnFocus={() => uploadButton.current}
        />
      )}
      {open?.kind === 'delete-folder' && library && (
        <DeleteFolderDialog
          name={shownName(open.entry)}
          onConfirm={() => library.deleteCollection(open.entry.folder.id, 'keep')}
          onClose={() => setOpen(null)}
          returnFocus={() => uploadButton.current}
        />
      )}
    </>
  );
}

/** An empty folder: nothing in it goes anywhere, so a plain confirm. */
function DeleteFolderDialog({
  name,
  onConfirm,
  onClose,
  returnFocus,
}: {
  name: string;
  onConfirm(): Promise<void>;
  onClose(): void;
  returnFocus(): HTMLElement | null;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <Dialog
      title={`Delete "${name}"?`}
      initialFocus={cancel}
      onClose={onClose}
      busy={busy}
      returnFocus={returnFocus}
      className="sheet"
    >
      <p className="sheet__lede">The folder is empty, so nothing else is deleted.</p>
      {failed && <FieldError>Couldn&apos;t delete the folder. Try again.</FieldError>}
      <div className="dialog__actions">
        <button ref={cancel} type="button" className="button" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="button button--ink"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setFailed(false);
            onConfirm().then(onClose, () => {
              setFailed(true);
              setBusy(false);
            });
          }}
        >
          {busy ? 'Deleting…' : 'Delete folder'}
        </button>
      </div>
    </Dialog>
  );
}

/** One folder; going to another folder starts it afresh (no leftover search). */
export function FolderScreen() {
  const { folderId } = useParams();
  return <FilesScreen key={folderId} />;
}

/** A photo or PDF from Files, shown inside Cloud Box (`/files/open/:itemId`). */
export function FileViewerScreen() {
  const { itemId } = useParams();
  const { library, snapshot } = useLibrary();
  const { refresh } = useStatus();
  const navigate = useNavigate();
  const ready = snapshot.syncedAt !== null;
  const found = itemId ? snapshot.items.get(itemId) : undefined;
  const item = found && !found.trashedAt ? found : undefined;
  useTitle(item?.meta?.name ?? 'Files');
  const [open, setOpen] = useState<'move' | 'delete' | null>(null);
  const [said, setSaid] = useState('');
  const folders = useMemo(() => allFolders(snapshot), [snapshot]);

  const load = useCallback(
    async (it: ItemView, role: 'original' | 'preview', signal: AbortSignal) => {
      if (!library) throw new Error('locked');
      const bytes = await library.readBlob(it, role, signal);
      const type = (role === 'preview' ? it.meta?.previewMime : it.meta?.mime) ?? '';
      return new Blob([bytes as BlobPart], { type });
    },
    [library],
  );

  const folderLink = (id: string) => {
    const c = snapshot.collections.get(id);
    return c?.role === 'files' ? '/files' : `/files/${id}`;
  };
  const back = () =>
    void navigate(item ? folderLink(item.collectionId) : '/files', {
      state: { focus: item?.id },
    });

  if (!ready) {
    return (
      <p className="waiting" aria-live="polite">
        Opening your files…
      </p>
    );
  }
  if (!item || !library) {
    return (
      <div className="empty">
        <FilesIcon size={40} />
        <h1>This file isn&apos;t here any more</h1>
        <p>
          <Link to="/files">Back to Files</Link>
        </p>
      </div>
    );
  }
  const name = item.meta?.name ?? "File that can't be read";
  return (
    <>
      <FileViewer
        item={item}
        where={pathText(snapshot, item.collectionId)}
        load={load}
        onClose={back}
        onDownload={() => saveOriginal(library, item)}
        onMove={() => setOpen('move')}
        onDelete={() => setOpen('delete')}
        said={said}
      />
      {open === 'move' && (
        <MovePicker
          name={name}
          folders={folders}
          hereId={item.collectionId}
          onMove={async (to) => {
            await library.move([item.id], to);
            const f = folders.find((x) => x.folder.id === to);
            setSaid(`Moved to ${f?.folder.name ?? 'the folder'}`);
          }}
          onClose={() => setOpen(null)}
        />
      )}
      {open === 'delete' && (
        <DeleteSheet
          what="file"
          count={1}
          onConfirm={async () => {
            const home = folderLink(item.collectionId);
            try {
              await library.trash([item.id]);
              void navigate(home);
            } finally {
              refresh({ sync: false });
            }
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
