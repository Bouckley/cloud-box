import { BoxError, ClientError, type ItemView, type Library } from '@cloudbox/core';
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/** Decrypts one item's thumbnail; null when it has none. */
export type ThumbLoader = (item: ItemView, signal: AbortSignal) => Promise<Blob | null>;

type Waiting = { item: ItemView; done: (url: string | null) => void; cancelled: boolean };

/** A failure worth trying again: the box was out of reach or busy. */
function transient(e: unknown): boolean {
  if (e instanceof ClientError) return e.code === 'box_unreachable';
  if (e instanceof BoxError) return e.status >= 500 || e.status === 429;
  return e instanceof TypeError; // fetch's network failure
}

const RETRY_MS = [2_000, 8_000, 30_000];

/**
 * Decrypted thumbnails as object URLs, kept in memory only (scope ruling S3):
 * at most `concurrent` decrypting at once, the `max` most recently used kept,
 * older ones revoked. `done(null)` means show the file tile instead.
 */
export class ThumbCache {
  readonly #load: ThumbLoader;
  readonly #max: number;
  readonly #concurrent: number;
  readonly #retryMs: readonly number[];
  readonly #urls = new Map<string, string>();
  /** Items with no thumbnail, or one that can't be read: not asked again. */
  readonly #none = new Set<string>();
  readonly #queue: Waiting[] = [];
  readonly #inFlight = new Map<string, Waiting[]>();
  readonly #timers = new Set<ReturnType<typeof setTimeout>>();
  #abort = new AbortController();
  #running = 0;

  constructor(
    load: ThumbLoader,
    o: { max?: number; concurrent?: number; retryMs?: readonly number[] } = {},
  ) {
    this.#load = load;
    this.#max = o.max ?? 500;
    this.#concurrent = o.concurrent ?? 6;
    this.#retryMs = o.retryMs ?? RETRY_MS;
  }

  /** The URL if it is already decrypted (and marks it recently used). */
  get(id: string): string | undefined {
    const url = this.#urls.get(id);
    if (url !== undefined) {
      this.#urls.delete(id);
      this.#urls.set(id, url);
    }
    return url;
  }

  /** The URL if it is already decrypted, without touching the LRU order. */
  peek(id: string): string | undefined {
    return this.#urls.get(id);
  }

  /** Whether the item is known to have no thumbnail that can be shown. */
  missing(id: string): boolean {
    return this.#none.has(id);
  }

  /** Asks for an item's thumbnail; `done` runs once it is settled. Returns a cancel. */
  request(item: ItemView, done: (url: string | null) => void): () => void {
    const ready = this.get(item.id);
    if (ready !== undefined) {
      done(ready);
      return () => {};
    }
    if (this.#none.has(item.id)) {
      done(null);
      return () => {};
    }
    const w: Waiting = { item, done, cancelled: false };
    this.#enqueue(w, 0);
    return () => {
      w.cancelled = true;
    };
  }

  /**
   * Revokes every URL and stops loading (on lock, or a StrictMode remount).
   * The cache stays usable afterwards with a fresh abort signal.
   */
  clear(): void {
    this.#abort.abort();
    this.#abort = new AbortController();
    for (const t of this.#timers) clearTimeout(t);
    this.#timers.clear();
    for (const url of this.#urls.values()) URL.revokeObjectURL(url);
    this.#urls.clear();
    this.#queue.length = 0;
    this.#inFlight.clear();
  }

  #enqueue(w: Waiting, attempt: number): void {
    const joined = this.#inFlight.get(w.item.id);
    if (joined) joined.push(w);
    else this.#queue.push(Object.assign(w, { attempt }));
    this.#pump();
  }

  #pump(): void {
    while (this.#running < this.#concurrent && this.#queue.length) {
      const w = this.#queue.shift()! as Waiting & { attempt?: number };
      if (w.cancelled) continue;
      const id = w.item.id;
      const ready = this.#urls.get(id);
      if (ready !== undefined) {
        w.done(ready);
        continue;
      }
      const joined = this.#inFlight.get(id);
      if (joined) {
        joined.push(w);
        continue;
      }
      const waiting = [w];
      this.#inFlight.set(id, waiting);
      this.#running++;
      const signal = this.#abort.signal;
      const settle = (url: string | null) => {
        for (const x of waiting) if (!x.cancelled) x.done(url);
      };
      this.#load(w.item, signal)
        .then((blob) => {
          if (signal.aborted) return;
          if (!blob) {
            this.#none.add(id);
            settle(null);
            return;
          }
          const url = URL.createObjectURL(blob);
          const old = this.#urls.get(id);
          if (old !== undefined && old !== url) URL.revokeObjectURL(old);
          this.#urls.set(id, url);
          this.#evict();
          settle(url);
        })
        .catch((e: unknown) => {
          if (signal.aborted) return;
          const attempt = w.attempt ?? 0;
          if (transient(e) && attempt < this.#retryMs.length) {
            const t = setTimeout(() => {
              this.#timers.delete(t);
              for (const x of waiting) if (!x.cancelled) this.#enqueue(x, attempt + 1);
            }, this.#retryMs[attempt]);
            this.#timers.add(t);
            return;
          }
          // Out of retries: show the file tile now; a later request tries again.
          if (!transient(e)) this.#none.add(id);
          settle(null);
        })
        .finally(() => {
          if (this.#inFlight.get(id) === waiting) this.#inFlight.delete(id);
          this.#running--;
          this.#pump();
        });
    }
  }

  #evict(): void {
    while (this.#urls.size > this.#max) {
      const [oldest, url] = this.#urls.entries().next().value as [string, string];
      this.#urls.delete(oldest);
      URL.revokeObjectURL(url);
    }
  }
}

/** Loads the thumb blob, decrypting it with the item's file key. */
export function libraryThumbs(library: Library): ThumbLoader {
  return async (item, signal) => {
    const mime = item.meta?.thumbMime;
    if (!item.blobs.thumb || !mime) return null;
    const bytes = await library.readBlob(item, 'thumb', signal);
    return new Blob([bytes as BlobPart], { type: mime });
  };
}

const ThumbContext = createContext<ThumbCache | null>(null);

/** One cache per unlocked library; cleared when the library goes away. */
export function ThumbsProvider({
  library,
  children,
}: {
  library: Library | null;
  children: ReactNode;
}) {
  const cache = useMemo(() => (library ? new ThumbCache(libraryThumbs(library)) : null), [library]);
  useEffect(() => () => cache?.clear(), [cache]);
  return createElement(ThumbContext.Provider, { value: cache }, children);
}

/**
 * The item's decrypted thumbnail: `url` once ready, `missing` when there is
 * none to show (the tile shows its file type instead).
 */
export function useThumb(item: ItemView): { url: string | null; missing: boolean } {
  const cache = useContext(ThumbContext);
  const [got, setGot] = useState<{ id: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!cache) return;
    return cache.request(item, (url) => setGot({ id: item.id, url }));
  }, [cache, item]);
  if (got?.id === item.id) return { url: got.url, missing: got.url === null };
  return { url: cache?.peek(item.id) ?? null, missing: cache?.missing(item.id) ?? false };
}

/** The item's decrypted thumbnail URL, or null while loading or when it has none. */
export const useThumbUrl = (item: ItemView): string | null => useThumb(item).url;
