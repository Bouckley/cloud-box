import type { CollectionView, ItemView, LibrarySnapshot } from '@cloudbox/core';

export const coll = (
  id: string,
  kind: 'album' | 'folder',
  over: Partial<CollectionView> = {},
): CollectionView => ({
  id,
  kind,
  parentId: null,
  name: id,
  role: null,
  deletedAt: null,
  key: new Uint8Array(32),
  ...over,
});

/** A photo item for tests; dates are RFC 3339 strings. */
export function photo(
  id: string,
  takenAt: string | null,
  over: Partial<ItemView> = {},
  meta: Partial<NonNullable<ItemView['meta']>> = {},
): ItemView {
  return {
    id,
    collectionId: 'album',
    meta: {
      v: 1,
      name: `${id}.jpg`,
      mime: 'image/jpeg',
      size: 1000,
      modifiedAt: '2020-01-01T00:00:00Z',
      takenAt,
      width: 640,
      height: 480,
      durationMs: null,
      favourite: false,
      thumbMime: 'image/webp',
      previewMime: 'image/jpeg',
      ...meta,
    },
    blobs: {},
    state: 'replicated',
    trashedAt: null,
    createdAt: new Date('2020-01-01T00:00:00Z'),
    ...over,
  };
}

/** A library with one album ('album') and one folder ('folder'). */
export function snap(items: ItemView[]): LibrarySnapshot {
  return {
    collections: new Map([
      ['album', coll('album', 'album')],
      ['folder', coll('folder', 'folder')],
    ]),
    items: new Map(items.map((i) => [i.id, i])),
    syncedAt: new Date(),
  };
}
