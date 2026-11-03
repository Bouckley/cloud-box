import type { components } from '@cloudbox/api-client';
import {
  ad,
  createFileDecryptor,
  CryptoError,
  decryptFile,
  FILE_CHUNK_BYTES,
  FILE_CHUNK_OVERHEAD,
  FILE_HEADER_BYTES,
  newId,
  randomKey,
  unwrapKey,
  wrapKey,
  type BlobRole,
} from '@cloudbox/crypto';
import { BoxError, ClientError } from './errors.ts';
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
  /** Null when the key cannot be unwrapped: shown as unreadable, never written to. */
  key: Uint8Array | null;
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
    const key = this.#writableKey(id);
    const role = this.#snapshot.collections.get(id)!.role;
    try {
      must(
        await this.#api.PATCH('/v1/collections/{id}', {
          params: { path: { id } },
          body: { nameEnc: b64(encodeName(key, id, { v: 1, name, role })) },
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
    await this.sync();
    const col = this.#snapshot.collections.get(id);
    if (!col) throw new ClientError('not_found');
    if (col.role !== null) throw new Error('Photos and Files cannot be deleted.');
    // The box refuses a collection with folders still in it; say so before
    // moving anything, so the action is not left half done.
    for (const c of this.#snapshot.collections.values()) {
      if (c.parentId === id && c.deletedAt === null) {
        throw new BoxError(409, {
          code: 'collection_not_empty',
          message: 'This folder still has folders in it.',
          action: 'Move or delete those folders first.',
        });
      }
    }
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
    const targetKey = this.#writableKey(collectionId);
    await this.#each(ids, async (id) => {
      const fileKey = this.#fileKeys.get(id);
      if (!fileKey) throw new ClientError('not_found');
      this.#open();
      must(
        await this.#api.PATCH('/v1/items/{id}', {
          params: { path: { id } },
          body: {
            collectionId,
            fileKeyEnc: b64(wrapKey(targetKey, fileKey, ad.itemFileKey(id))),
          },
        }),
      );
    });
  }

  async setFavourite(id: string, on: boolean): Promise<void> {
    this.#open();
    const item = this.#snapshot.items.get(id);
    const fileKey = this.#fileKeys.get(id);
    if (!item?.meta || !fileKey) throw new ClientError('not_found');
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
    if (!blob || !fileKey) throw new ClientError('not_found');
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
   * Downloads and decrypts a blob as a stream of plaintext chunks (4 MiB
   * each), for files too big to hold in memory. The stream errors if the
   * blob is cut short, has extra bytes, or fails to decrypt.
   */
  readBlobStream(item: ItemView, role: BlobRole, signal?: AbortSignal): ReadableStream<Uint8Array> {
    this.#open();
    const blob = item.blobs[role];
    const fileKey = this.#fileKeys.get(item.id);
    if (!blob || !fileKey) throw new ClientError('not_found');
    const key = fileKey.slice();
    const aad = ad.itemBlob(item.id, role);
    const api = this.#api;
    const queue = new ByteQueue();
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let dec: ReturnType<typeof createFileDecryptor> | null = null;
    const fill = async (n: number) => {
      while (queue.length < n) {
        const { done, value } = await reader!.read();
        if (done) return;
        queue.push(value);
      }
    };
    const stop = () => {
      key.fill(0);
      void reader?.cancel().catch(() => {});
    };
    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          signal?.throwIfAborted();
          if (!reader) {
            const res = await api.GET('/v1/blobs/{id}', {
              params: { path: { id: blob.id } },
              parseAs: 'stream',
              ...(signal ? { signal } : {}),
            });
            reader = (must(res) as unknown as ReadableStream<Uint8Array>).getReader();
            await fill(FILE_HEADER_BYTES);
            if (queue.length < FILE_HEADER_BYTES) throw new CryptoError('decrypt_failed');
            dec = createFileDecryptor(key, queue.take(FILE_HEADER_BYTES), aad);
          }
          await fill(FILE_CHUNK_BYTES + FILE_CHUNK_OVERHEAD);
          if (queue.length < FILE_CHUNK_OVERHEAD) throw new CryptoError('decrypt_failed');
          const frame = queue.take(Math.min(queue.length, FILE_CHUNK_BYTES + FILE_CHUNK_OVERHEAD));
          const { plaintext, last } = dec!.pull(frame);
          if (last) {
            // Nothing may follow the final chunk.
            await fill(1);
            if (queue.length > 0) throw new CryptoError('decrypt_failed');
            dec!.finish();
            if (plaintext.length > 0) controller.enqueue(plaintext);
            key.fill(0);
            controller.close();
            return;
          }
          controller.enqueue(plaintext);
        } catch (e) {
          stop();
          throw e;
        }
      },
      cancel() {
        stop();
      },
    });
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
    if (this.#snapshot.collections.get(collectionId)?.deletedAt) {
      throw new ClientError('not_found');
    }
    // Copies: lock() zero-fills the library's keys, and an upload must never
    // go on encrypting with a wiped key. It also checks alive() before each step.
    const collectionKey = this.#writableKey(collectionId).slice();
    const dedupeKey = this.#dedupe.slice();
    try {
      const r = await uploadFile(
        { api: this.#api, dedupeKey, collectionKey, collectionId, alive: () => this.#open() },
        f,
        media,
        o,
      );
      if (r.kind === 'uploaded') await this.sync();
      return r;
    } finally {
      collectionKey.fill(0);
      dedupeKey.fill(0);
    }
  }

  /** Wipes every key this library holds. Called by Unlocked.lock(). */
  wipe(): void {
    this.#locked = true;
    for (const c of this.#snapshot.collections.values()) c.key?.fill(0);
    for (const k of this.#fileKeys.values()) k.fill(0);
    this.#fileKeys.clear();
    this.#raw.clear();
    this.#snapshot = { collections: new Map(), items: new Map(), syncedAt: null };
    this.#emit();
  }

  #open(): void {
    if (this.#locked) throw new ClientError('locked');
  }

  /** The key of a collection that may be written to: known and readable. */
  #writableKey(id: string): Uint8Array {
    this.#open();
    const col = this.#snapshot.collections.get(id);
    if (!col) throw new ClientError('not_found');
    if (!col.key) throw new ClientError('unreadable');
    return col.key;
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

  /**
   * One round: list collections, then page through item changes. Nothing is
   * kept until the last page arrives, so a round that fails part-way is
   * repeated in full next time instead of skipping what it missed.
   */
  async #syncOnce(): Promise<void> {
    const before = this.#snapshot;
    const { collections: list } = must(await this.#api.GET('/v1/collections'));
    this.#open();
    const { next: collections, created, dropped } = this.#collections(before.collections, list);

    let cursor = this.#cursor;
    const changes = new Map<string, ApiItem | null>();
    try {
      let more = true;
      while (more) {
        const page = must(
          await this.#api.GET('/v1/items', {
            params: { query: { since: cursor, limit: SYNC_PAGE } },
          }),
        );
        for (const it of page.items) changes.set(it.id, it);
        for (const id of page.purged) changes.set(id, null);
        cursor = page.cursor;
        more = page.more;
      }
      this.#open();
    } catch (e) {
      for (const c of created) c.key?.fill(0);
      throw e;
    }

    // Commit the round.
    this.#cursor = cursor;
    for (const c of dropped) c.key?.fill(0);
    const dirty = new Set<string>();
    const purged = new Set<string>();
    for (const [id, it] of changes) {
      if (it) {
        this.#raw.set(id, it);
        dirty.add(id);
      } else {
        this.#raw.delete(id);
        purged.add(id);
      }
    }
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
  ): {
    next: ReadonlyMap<string, CollectionView>;
    /** Views with keys unwrapped in this round. */
    created: CollectionView[];
    /** Views no longer listed, whose keys go once the round commits. */
    dropped: CollectionView[];
  } {
    const next = new Map<string, CollectionView>();
    const created: CollectionView[] = [];
    let same = prev.size === list.length;
    for (const c of list) {
      const old = prev.get(c.id);
      const deletedAt = c.deletedAt ? new Date(c.deletedAt) : null;
      const view = old
        ? this.#updatedCollection(old, c, deletedAt)
        : this.#collectionView(c, deletedAt);
      if (!old) created.push(view);
      if (view !== old) same = false;
      next.set(c.id, view);
    }
    if (same) return { next: prev, created: [], dropped: [] };
    const dropped = [...prev.values()].filter((old) => !next.has(old.id));
    return { next, created, dropped };
  }

  #collectionView(c: ApiCollection, deletedAt: Date | null): CollectionView {
    let key: Uint8Array;
    try {
      key = unwrapKey(this.#master, fromB64(c.keyEnc), ad.collectionKey(c.id));
    } catch {
      return {
        id: c.id,
        kind: c.kind,
        parentId: c.parentId,
        name: null,
        role: null,
        deletedAt,
        key: null,
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
    const n = old.key ? decodeName(old.key, c.id, fromB64(c.nameEnc)) : null;
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
    if (col?.key) {
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

/** Bytes from a stream, taken back out in exact-sized pieces. */
class ByteQueue {
  #chunks: Uint8Array[] = [];
  #length = 0;

  get length(): number {
    return this.#length;
  }

  push(b: Uint8Array): void {
    if (b.length === 0) return;
    this.#chunks.push(b);
    this.#length += b.length;
  }

  /** Removes and returns exactly n bytes; n must be at most length. */
  take(n: number): Uint8Array {
    const out = new Uint8Array(n);
    let at = 0;
    while (at < n) {
      const head = this.#chunks[0]!;
      const use = Math.min(head.length, n - at);
      out.set(head.subarray(0, use), at);
      at += use;
      if (use === head.length) this.#chunks.shift();
      else this.#chunks[0] = head.subarray(use);
    }
    this.#length -= n;
    return out;
  }
}
