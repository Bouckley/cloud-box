import type { components } from '@cloudbox/api-client';
import {
  ad,
  decryptFile,
  newId,
  randomKey,
  unwrapKey,
  wrapKey,
  type BlobRole,
} from '@cloudbox/crypto';
import { decodeMeta, decodeName, encodeMeta, encodeName, type ItemMeta } from './meta.ts';
import { b64, fromB64, must, type AuthedClient } from './transport.ts';
import {
  uploadFile,
  type MediaAdapter,
  type SourceFile,
  type UploadOptions,
  type UploadResult,
} from './upload.ts';

type ApiCollection = components['schemas']['Collection'];
type ApiItem = components['schemas']['Item'];
export type ItemState = components['schemas']['ItemState'];
export type CollectionKind = components['schemas']['CollectionKind'];

export type CollectionView = {
  id: string;
  kind: CollectionKind;
  parentId: string | null;
  /** Null when the name cannot be read. */
  name: string | null;
  role: 'photos' | 'files' | null;
  deletedAt: Date | null;
  key: Uint8Array;
};

export type ItemView = {
  id: string;
  collectionId: string;
  /** Null when the metadata cannot be read: show the item as unreadable. */
  meta: ItemMeta | null;
  blobs: Partial<Record<BlobRole, { id: string; size: number }>>;
  state: ItemState;
  trashedAt: Date | null;
  createdAt: Date;
};

export type TrashView = { item: ItemView; daysLeft: number };

export type LibrarySnapshot = {
  collections: ReadonlyMap<string, CollectionView>;
  items: ReadonlyMap<string, ItemView>;
  syncedAt: Date | null;
};

const SYNC_PAGE = 500;

/**
 * The decrypted index of the user's collections and items, kept in memory
 * only. Every change replaces the snapshot, so React can use
 * useSyncExternalStore. Actions send the change, then sync.
 */
export class Library {
  readonly #api: AuthedClient;
  readonly #master: Uint8Array;
  readonly #dedupe: Uint8Array;
  readonly #listeners = new Set<() => void>();
  #snapshot: LibrarySnapshot = { collections: new Map(), items: new Map(), syncedAt: null };
  #cursor = '0';
  #raw = new Map<string, ApiItem>();
  #fileKeys = new Map<string, Uint8Array>();
  #roots: { photos: string; files: string } | null = null;
  #syncing: Promise<void> | null = null;
  #again = false;
  #locked = false;

  constructor(api: AuthedClient, keys: { master: Uint8Array; dedupe: Uint8Array }) {
    this.#api = api;
    this.#master = keys.master;
    this.#dedupe = keys.dedupe;
  }

  subscribe(fn: () => void): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  snapshot(): LibrarySnapshot {
    return this.#snapshot;
  }

  /** Brings the index up to date. Calls during a sync share it plus one more round. */
  sync(): Promise<void> {
    try {
      this.#open();
    } catch (e) {
      return Promise.reject(e);
    }
    if (this.#syncing) {
      this.#again = true;
      return this.#syncing;
    }
    this.#syncing = (async () => {
      try {
        do {
          this.#again = false;
          await this.#syncOnce();
        } while (this.#again);
      } finally {
        this.#syncing = null;
      }
    })();
    return this.#syncing;
  }

  roots(): { photos: string; files: string } {
    if (!this.#roots) throw new Error('The library is not ready yet.');
    return this.#roots;
  }

  /** Creates the Photos album and the Files folder if either is missing. */
  async ensureRoots(): Promise<void> {
    await this.sync();
    let photos = this.#findRoot('photos');
    let files = this.#findRoot('files');
    if (!photos) photos = await this.#create('album', 'Photos', null, 'photos');
    if (!files) files = await this.#create('folder', 'Files', null, 'files');
    this.#roots = { photos, files };
    await this.sync();
  }

  /** Folders without a parent go in the Files root; albums never have one. */
  async createCollection(kind: CollectionKind, name: string, parentId?: string): Promise<string> {
    const parent = kind === 'folder' ? (parentId ?? this.roots().files) : null;
    const id = await this.#create(kind, name, parent, null);
    await this.sync();
    return id;
  }

  async renameCollection(id: string, name: string): Promise<void> {
    this.#open();
    const col = this.#snapshot.collections.get(id);
    if (!col) throw notFound();
    try {
      must(
        await this.#api.PATCH('/v1/collections/{id}', {
          params: { path: { id } },
          body: { nameEnc: b64(encodeName(col.key, id, { v: 1, name, role: col.role })) },
        }),
      );
    } finally {
      await this.sync();
    }
  }

  /**
   * 'keep' moves the items out first: an album's into Photos, a folder's
   * into its parent (else the Files root). 'trash' puts them in Trash.
   */
  async deleteCollection(id: string, items: 'keep' | 'trash'): Promise<void> {
    this.#open();
    const col = this.#snapshot.collections.get(id);
    if (!col) throw notFound();
    if (col.role !== null) throw new Error('Photos and Files cannot be deleted.');
    const inside = [...this.#snapshot.items.values()]
      .filter((i) => i.collectionId === id && i.trashedAt === null)
      .map((i) => i.id);
    if (items === 'keep') {
      const target =
        col.kind === 'album' ? this.roots().photos : (col.parentId ?? this.roots().files);
      await this.move(inside, target);
    } else {
      await this.trash(inside);
    }
    try {
      must(await this.#api.DELETE('/v1/collections/{id}', { params: { path: { id } } }));
    } finally {
      await this.sync();
    }
  }

  async trash(ids: string[]): Promise<void> {
    await this.#each(ids, async (id) =>
      must(await this.#api.DELETE('/v1/items/{id}', { params: { path: { id } } })),
    );
  }

  async restore(ids: string[]): Promise<void> {
    await this.#each(ids, async (id) =>
      must(await this.#api.POST('/v1/items/{id}/restore', { params: { path: { id } } })),
    );
  }

  /** Only for items in Trash; the box refuses others (409 not_in_trash). */
  async deleteForever(ids: string[]): Promise<void> {
    await this.#each(ids, async (id) =>
      must(await this.#api.DELETE('/v1/trash/{id}', { params: { path: { id } } })),
    );
  }

  /** Moves items into another collection, re-wrapping each file key for it. */
  async move(ids: string[], collectionId: string): Promise<void> {
    this.#open();
    const target = this.#snapshot.collections.get(collectionId);
    if (!target) throw notFound();
    await this.#each(ids, async (id) => {
      const fileKey = this.#fileKeys.get(id);
      if (!fileKey) throw notFound();
      must(
        await this.#api.PATCH('/v1/items/{id}', {
          params: { path: { id } },
          body: {
            collectionId,
            fileKeyEnc: b64(wrapKey(target.key, fileKey, ad.itemFileKey(id))),
          },
        }),
      );
    });
  }

  async setFavourite(id: string, on: boolean): Promise<void> {
    this.#open();
    const item = this.#snapshot.items.get(id);
    const fileKey = this.#fileKeys.get(id);
    if (!item?.meta || !fileKey) throw notFound();
    const m: ItemMeta = { ...item.meta, favourite: on };
    try {
      must(
        await this.#api.PATCH('/v1/items/{id}', {
          params: { path: { id } },
          body: { metadataEnc: b64(encodeMeta(fileKey, id, m)) },
        }),
      );
    } finally {
      await this.sync();
    }
  }

  /** Items in Trash with the days left before the box deletes them for good. */
  async trashList(): Promise<TrashView[]> {
    await this.sync();
    const { items } = must(await this.#api.GET('/v1/trash'));
    const out: TrashView[] = [];
    for (const t of items) {
      const item = this.#snapshot.items.get(t.itemId);
      if (item) out.push({ item, daysLeft: t.daysLeft });
    }
    return out;
  }

  /** Downloads and decrypts one of an item's blobs. */
  async readBlob(item: ItemView, role: BlobRole, signal?: AbortSignal): Promise<Uint8Array> {
    this.#open();
    const blob = item.blobs[role];
    const fileKey = this.#fileKeys.get(item.id);
    if (!blob || !fileKey) throw notFound();
    signal?.throwIfAborted();
    const res = await this.#api.GET('/v1/blobs/{id}', {
      params: { path: { id: blob.id } },
      parseAs: 'arrayBuffer',
      ...(signal ? { signal } : {}),
    });
    const bytes = new Uint8Array(must(res) as unknown as ArrayBuffer);
    signal?.throwIfAborted();
    return decryptFile(fileKey, bytes, ad.itemBlob(item.id, role));
  }

  /**
   * Encrypts and uploads one file into a collection, then syncs. A file the
   * box already has (by keyed content hash) is not sent again.
   */
  async upload(
    f: SourceFile,
    collectionId: string,
    media: MediaAdapter,
    o?: UploadOptions,
  ): Promise<UploadResult> {
    this.#open();
    const col = this.#snapshot.collections.get(collectionId);
    if (!col || col.deletedAt) throw notFound();
    const r = await uploadFile(
      { api: this.#api, dedupeKey: this.#dedupe, collectionKey: col.key, collectionId },
      f,
      media,
      o,
    );
    if (r.kind === 'uploaded') await this.sync();
    return r;
  }

  /** Wipes every key this library holds. Called by Unlocked.lock(). */
  wipe(): void {
    this.#locked = true;
    for (const c of this.#snapshot.collections.values()) c.key.fill(0);
    for (const k of this.#fileKeys.values()) k.fill(0);
    this.#fileKeys.clear();
    this.#raw.clear();
    this.#snapshot = { collections: new Map(), items: new Map(), syncedAt: null };
    this.#emit();
  }

  #open(): void {
    if (this.#locked) throw new Error('This account is locked. Unlock it again.');
  }

  /** Runs fn for each id in order, then syncs even if one failed. */
  async #each(ids: string[], fn: (id: string) => Promise<unknown>): Promise<void> {
    this.#open();
    if (ids.length === 0) return;
    try {
      for (const id of ids) await fn(id);
    } finally {
      await this.sync();
    }
  }

  async #create(
    kind: CollectionKind,
    name: string,
    parentId: string | null,
    role: 'photos' | 'files' | null,
  ): Promise<string> {
    this.#open();
    const id = newId();
    const key = randomKey();
    must(
      await this.#api.POST('/v1/collections', {
        body: {
          id,
          kind,
          parentId,
          nameEnc: b64(encodeName(key, id, { v: 1, name, role })),
          keyEnc: b64(wrapKey(this.#master, key, ad.collectionKey(id))),
        },
      }),
    );
    key.fill(0);
    return id;
  }

  #findRoot(role: 'photos' | 'files'): string | null {
    const kind = role === 'photos' ? 'album' : 'folder';
    // Two devices racing could make two; the first one listed wins everywhere.
    for (const c of this.#snapshot.collections.values()) {
      if (c.role === role && c.kind === kind && c.deletedAt === null) return c.id;
    }
    return null;
  }

  async #syncOnce(): Promise<void> {
    const before = this.#snapshot;
    const { collections: list } = must(await this.#api.GET('/v1/collections'));
    const collections = this.#collections(before.collections, list);

    const dirty = new Set<string>();
    const purged = new Set<string>();
    let more = true;
    while (more) {
      const page = must(
        await this.#api.GET('/v1/items', {
          params: { query: { since: this.#cursor, limit: SYNC_PAGE } },
        }),
      );
      for (const it of page.items) {
        this.#raw.set(it.id, it);
        dirty.add(it.id);
        purged.delete(it.id);
      }
      for (const id of page.purged) {
        this.#raw.delete(id);
        dirty.delete(id);
        purged.add(id);
      }
      this.#cursor = page.cursor;
      more = page.more;
    }
    this.#open();

    // Rows whose key could not be found last time (their collection was not
    // listed yet) are tried again.
    if (collections !== before.collections) {
      for (const id of this.#raw.keys()) if (!this.#fileKeys.has(id)) dirty.add(id);
    }
    let items = before.items;
    const gone = [...purged].filter((id) => before.items.has(id));
    if (dirty.size > 0 || gone.length > 0) {
      const next = new Map(before.items);
      for (const id of purged) {
        this.#dropKey(id);
        next.delete(id);
      }
      for (const id of dirty) next.set(id, this.#itemView(this.#raw.get(id)!, collections));
      items = next;
    }

    this.#snapshot = { collections, items, syncedAt: new Date() };
    this.#emit();
  }

  #dropKey(id: string): void {
    this.#fileKeys.get(id)?.fill(0);
    this.#fileKeys.delete(id);
  }

  #collections(
    prev: ReadonlyMap<string, CollectionView>,
    list: ApiCollection[],
  ): ReadonlyMap<string, CollectionView> {
    const next = new Map<string, CollectionView>();
    let same = prev.size === list.length;
    for (const c of list) {
      const old = prev.get(c.id);
      const deletedAt = c.deletedAt ? new Date(c.deletedAt) : null;
      const view = old
        ? this.#updatedCollection(old, c, deletedAt)
        : this.#collectionView(c, deletedAt);
      if (view !== old) same = false;
      next.set(c.id, view);
    }
    if (same) return prev;
    for (const [id, old] of prev) if (!next.has(id)) old.key.fill(0);
    return next;
  }

  #collectionView(c: ApiCollection, deletedAt: Date | null): CollectionView {
    let key: Uint8Array;
    try {
      key = unwrapKey(this.#master, fromB64(c.keyEnc), ad.collectionKey(c.id));
    } catch {
      key = new Uint8Array(32);
      return {
        id: c.id,
        kind: c.kind,
        parentId: c.parentId,
        name: null,
        role: null,
        deletedAt,
        key,
      };
    }
    const n = decodeName(key, c.id, fromB64(c.nameEnc));
    return {
      id: c.id,
      kind: c.kind,
      parentId: c.parentId,
      name: n?.name ?? null,
      role: n?.role ?? null,
      deletedAt,
      key,
    };
  }

  /** Reuses the old view (and key) when nothing visible changed. */
  #updatedCollection(
    old: CollectionView,
    c: ApiCollection,
    deletedAt: Date | null,
  ): CollectionView {
    const n = decodeName(old.key, c.id, fromB64(c.nameEnc));
    const name = n?.name ?? null;
    const role = n?.role ?? null;
    if (
      old.parentId === c.parentId &&
      old.name === name &&
      old.role === role &&
      (old.deletedAt?.getTime() ?? null) === (deletedAt?.getTime() ?? null)
    ) {
      return old;
    }
    return { ...old, parentId: c.parentId, name, role, deletedAt };
  }

  #itemView(raw: ApiItem, collections: ReadonlyMap<string, CollectionView>): ItemView {
    const col = collections.get(raw.collectionId);
    let meta: ItemMeta | null = null;
    this.#dropKey(raw.id);
    if (col) {
      try {
        const fileKey = unwrapKey(col.key, fromB64(raw.fileKeyEnc), ad.itemFileKey(raw.id));
        this.#fileKeys.set(raw.id, fileKey);
        meta = decodeMeta(fileKey, raw.id, fromB64(raw.metadataEnc));
      } catch {
        meta = null;
      }
    }
    const blobs: ItemView['blobs'] = {};
    for (const b of raw.blobs) blobs[b.role] = { id: b.blobId, size: b.size };
    return {
      id: raw.id,
      collectionId: raw.collectionId,
      meta,
      blobs,
      state: raw.state,
      trashedAt: raw.trashedAt ? new Date(raw.trashedAt) : null,
      createdAt: new Date(raw.createdAt),
    };
  }

  #emit(): void {
    for (const fn of this.#listeners) fn();
  }
}

function notFound(): Error {
  return new Error('That item or collection is not in this library.');
}
