import type { CollectionView, ItemView, Library, LibrarySnapshot } from '@cloudbox/core';
import { isVideo, photoItems } from './timeline.ts';

/** One of the user's albums, with how many photos it holds and its newest one. */
export type AlbumEntry = { album: CollectionView; count: number; cover: ItemView | null };

export const albumName = (c: CollectionView) => c.name ?? "Album that can't be read";

export const countText = (n: number) => (n === 1 ? '1 photo' : `${n.toLocaleString()} photos`);

export const videoCountText = (n: number) => (n === 1 ? '1 video' : `${n.toLocaleString()} videos`);

/**
 * Every album the user made, by name: not the Photos root, not deleted ones.
 * Counts leave out Trash; the cover is the newest photo. All from the
 * decrypted snapshot in the browser.
 */
export function albumList(snapshot: LibrarySnapshot): AlbumEntry[] {
  const out = new Map<string, AlbumEntry>();
  for (const c of snapshot.collections.values()) {
    if (c.kind === 'album' && c.role === null && c.deletedAt === null) {
      out.set(c.id, { album: c, count: 0, cover: null });
    }
  }
  // photoItems is newest first, so the first photo seen is the cover.
  for (const item of photoItems(snapshot)) {
    const entry = out.get(item.collectionId);
    if (!entry) continue;
    entry.count++;
    entry.cover ??= item;
  }
  return [...out.values()].sort((a, b) => {
    const x = a.album.name;
    const y = b.album.name;
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return x.localeCompare(y, undefined, { sensitivity: 'base', numeric: true });
  });
}

/** Which photos a timeline or the viewer walks through. */
export type Scope =
  { kind: 'all' } | { kind: 'album'; id: string } | { kind: 'favourites' } | { kind: 'videos' };

export function scopeItems(snapshot: LibrarySnapshot, scope: Scope): ItemView[] {
  const all = photoItems(snapshot);
  switch (scope.kind) {
    case 'all':
      return all;
    case 'album':
      return all.filter((i) => i.collectionId === scope.id);
    case 'favourites':
      return all.filter((i) => i.meta?.favourite === true);
    case 'videos':
      return all.filter(isVideo);
  }
}

/** The viewer's `in` search parameter; Photos needs none. */
export function scopeParam(scope: Scope): string | null {
  switch (scope.kind) {
    case 'all':
      return null;
    case 'album':
      return `album:${scope.id}`;
    default:
      return scope.kind;
  }
}

export function parseScope(v: string | null): Scope {
  if (v === 'favourites' || v === 'videos') return { kind: v };
  if (v?.startsWith('album:') && v.length > 6) return { kind: 'album', id: v.slice(6) };
  return { kind: 'all' };
}

/** Where the viewer goes back to. */
export function scopeHome(scope: Scope): string {
  switch (scope.kind) {
    case 'all':
      return '/photos';
    case 'album':
      return `/albums/${scope.id}`;
    default:
      return `/albums/${scope.kind}`;
  }
}

/** One of the user's albums holding some of the chosen photos, and how many. */
export type AlbumHome = { entry: AlbumEntry; count: number };

/**
 * What the album picker offers for these photos: every album except one they
 * are all in already; which of the user's albums they are in now, most first
 * (adding moves them out: scope ruling S6); and how many are only in Photos.
 */
export function pickerChoices(
  snapshot: LibrarySnapshot,
  ids: readonly string[],
): { albums: AlbumEntry[]; homes: AlbumHome[]; onlyInPhotos: number } {
  const list = albumList(snapshot);
  const order = new Map(list.map((a, i) => [a.album.id, i]));
  const counts = new Map<string, number>();
  const where = new Set<string>();
  let onlyInPhotos = 0;
  for (const id of ids) {
    const item = snapshot.items.get(id);
    if (!item) continue;
    where.add(item.collectionId);
    if (order.has(item.collectionId)) {
      counts.set(item.collectionId, (counts.get(item.collectionId) ?? 0) + 1);
    } else if (snapshot.collections.get(item.collectionId)?.role === 'photos') {
      onlyInPhotos++;
    }
  }
  const homes = list
    .filter((a) => counts.has(a.album.id))
    .map((entry) => ({ entry, count: counts.get(entry.album.id)! }))
    .sort(
      (x, y) => y.count - x.count || order.get(x.entry.album.id)! - order.get(y.entry.album.id)!,
    );
  const [only] = where.size === 1 ? where : [null];
  return {
    albums: list.filter((a) => a.album.id !== only && a.album.key !== null),
    homes,
    onlyInPhotos,
  };
}

export type AlbumTarget = { id: string; name: string } | { newName: string };

/** Moves the photos into an album (made first for a new one); returns its name. */
export async function addToAlbum(
  library: Library,
  ids: readonly string[],
  target: AlbumTarget,
): Promise<{ id: string; name: string }> {
  const id = 'id' in target ? target.id : await library.createCollection('album', target.newName);
  const items = library.snapshot().items;
  await library.move(
    ids.filter((i) => items.get(i)?.collectionId !== id),
    id,
  );
  return { id, name: 'id' in target ? target.name : target.newName };
}
