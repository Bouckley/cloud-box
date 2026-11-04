import type { CollectionView, ItemView, LibrarySnapshot } from '@cloudbox/core';

/** One row in Files: a folder (with how many files are inside it) or a file. */
export type FileEntry =
  | { kind: 'folder'; folder: CollectionView; files: number; folders: number }
  | { kind: 'file'; item: ItemView };

export type SortBy = 'name' | 'modified' | 'size';

/** A folder's or file's own name; null when it can't be read. */
export const entryName = (e: FileEntry): string | null =>
  e.kind === 'folder' ? e.folder.name : (e.item.meta?.name ?? null);

const isFolder = (c: CollectionView | undefined): c is CollectionView =>
  !!c && c.kind === 'folder' && c.deletedAt === null;

function childFolders(snapshot: LibrarySnapshot, id: string): CollectionView[] {
  return [...snapshot.collections.values()].filter((c) => isFolder(c) && c.parentId === id);
}

function filesIn(snapshot: LibrarySnapshot, id: string): ItemView[] {
  return [...snapshot.items.values()].filter((i) => i.collectionId === id && !i.trashedAt);
}

function countFiles(snapshot: LibrarySnapshot, id: string): number {
  return (
    filesIn(snapshot, id).length +
    childFolders(snapshot, id).reduce((n, c) => n + countFiles(snapshot, c.id), 0)
  );
}

/** The folders and files directly in a folder, outside Trash and not deleted. */
export function folderEntries(snapshot: LibrarySnapshot, folderId: string): FileEntry[] {
  return [
    ...childFolders(snapshot, folderId).map((folder): FileEntry => ({
      kind: 'folder',
      folder,
      files: countFiles(snapshot, folder.id),
      folders: childFolders(snapshot, folder.id).length,
    })),
    ...filesIn(snapshot, folderId).map((item): FileEntry => ({ kind: 'file', item })),
  ];
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** Natural name order; names that can't be read go last. */
function byName(a: FileEntry, b: FileEntry): number {
  const x = entryName(a);
  const y = entryName(b);
  if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
  return collator.compare(x, y);
}

const modified = (e: FileEntry) =>
  e.kind === 'file' ? Date.parse(e.item.meta?.modifiedAt ?? '') || 0 : 0;
const size = (e: FileEntry) => (e.kind === 'file' ? (e.item.meta?.size ?? 0) : 0);

/** Folders first (by name), then files by the chosen order; ties by name. */
export function sortEntries(entries: FileEntry[], by: SortBy): FileEntry[] {
  return [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    if (a.kind === 'file' && by === 'modified') return modified(b) - modified(a) || byName(a, b);
    if (a.kind === 'file' && by === 'size') return size(b) - size(a) || byName(a, b);
    return byName(a, b);
  });
}

/**
 * Folders and files whose name contains the words typed, in this folder and
 * every folder inside it, with the folder each one is in. Names are decrypted
 * in the browser, so search never reaches the box.
 */
export function searchEntries(
  snapshot: LibrarySnapshot,
  folderId: string,
  query: string,
): { entry: FileEntry; folderId: string }[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return [];
  const out: { entry: FileEntry; folderId: string }[] = [];
  const walk = (id: string) => {
    for (const entry of sortEntries(folderEntries(snapshot, id), 'name')) {
      if (entryName(entry)?.toLocaleLowerCase().includes(q)) out.push({ entry, folderId: id });
      if (entry.kind === 'folder') walk(entry.folder.id);
    }
  };
  walk(folderId);
  return out;
}

/** Files › … › the folder, root first; empty when the folder isn't there. */
export function folderPath(snapshot: LibrarySnapshot, folderId: string): CollectionView[] {
  const path: CollectionView[] = [];
  let c = snapshot.collections.get(folderId);
  while (isFolder(c)) {
    path.unshift(c);
    if (c.role === 'files' || c.parentId === null) return c.role === 'files' ? path : [];
    c = snapshot.collections.get(c.parentId);
  }
  return [];
}

/** A folder can be deleted only with nothing in it; Trash doesn't count. */
export function isEmptyFolder(snapshot: LibrarySnapshot, folderId: string): boolean {
  return filesIn(snapshot, folderId).length === 0 && childFolders(snapshot, folderId).length === 0;
}

/** What every browser shows by itself. HEIC (Safari only) and SVG (can carry script) download. */
const SHOWN = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
]);

export const opensInTab = (mime: string): boolean => SHOWN.has(mime);

/**
 * Every folder a file can move to, Files first and then by where they are
 * (`Files › Taxes`) and name. Folders whose name or key can't be read are
 * left out: nothing could be shown for them, or put in them.
 */
export function allFolders(
  snapshot: LibrarySnapshot,
): { folder: CollectionView; where: string | null }[] {
  const out: { folder: CollectionView; where: string | null }[] = [];
  const root = [...snapshot.collections.values()].find((c) => isFolder(c) && c.role === 'files');
  if (!root) return out;
  const walk = (c: CollectionView, where: string | null) => {
    if (c.name === null || c.key === null) return;
    out.push({ folder: c, where });
    const here = where ? `${where} › ${c.name}` : c.name;
    for (const child of childFolders(snapshot, c.id).sort((a, b) =>
      collator.compare(a.name ?? '', b.name ?? ''),
    ))
      walk(child, here);
  };
  walk(root, null);
  return out;
}
