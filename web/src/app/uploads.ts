import type { Library, SourceFile, UploadResult } from '@cloudbox/core';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { webMedia } from '../platform/media.ts';

export type Duplicate = { name: string; itemId: string; trashed: boolean };
export type Failure = { id: number; name: string; error: unknown };

export type UploadState = {
  /** Files in this batch (reset when the panel is closed while idle). */
  total: number;
  done: number;
  queued: number;
  current: { name: string; sent: number; total: number } | null;
  duplicates: Duplicate[];
  failed: Failure[];
};

type Send = (
  f: SourceFile,
  onProgress: (sent: number, total: number) => void,
) => Promise<UploadResult>;

const EMPTY: UploadState = {
  total: 0,
  done: 0,
  queued: 0,
  current: null,
  duplicates: [],
  failed: [],
};

/**
 * Uploads chosen files one at a time (the pipeline already streams each file
 * in parts). Keeps the batch's results until the panel is closed.
 */
export class UploadQueue {
  readonly #send: Send;
  readonly #after: () => void;
  readonly #listeners = new Set<() => void>();
  readonly #waiting: SourceFile[] = [];
  readonly #failedFiles = new Map<number, SourceFile>();
  #state: UploadState = EMPTY;
  #running = false;
  #nextId = 1;

  constructor(send: Send, after: () => void = () => {}) {
    this.#send = send;
    this.#after = after;
  }

  subscribe(fn: () => void): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  snapshot(): UploadState {
    return this.#state;
  }

  get busy(): boolean {
    return this.#running || this.#waiting.length > 0;
  }

  add(files: SourceFile[]): void {
    if (!files.length) return;
    this.#waiting.push(...files);
    this.#set({ total: this.#state.total + files.length, queued: this.#waiting.length });
    void this.#run();
  }

  retry(id: number): void {
    const f = this.#failedFiles.get(id);
    if (!f) return;
    this.#failedFiles.delete(id);
    this.#waiting.push(f);
    this.#set({
      failed: this.#state.failed.filter((x) => x.id !== id),
      queued: this.#waiting.length,
    });
    void this.#run();
  }

  markRestored(itemId: string): void {
    this.#set({
      duplicates: this.#state.duplicates.map((d) =>
        d.itemId === itemId ? { ...d, trashed: false } : d,
      ),
    });
  }

  /** Clears the results; only when nothing is uploading. */
  close(): void {
    if (this.busy) return;
    this.#failedFiles.clear();
    this.#set(EMPTY);
  }

  async #run(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    try {
      for (let f = this.#waiting.shift(); f; f = this.#waiting.shift()) {
        const name = f.name;
        this.#set({ current: { name, sent: 0, total: f.size }, queued: this.#waiting.length });
        try {
          const r = await this.#send(f, (sent, total) =>
            this.#set({ current: { name, sent, total } }),
          );
          const duplicates =
            r.kind === 'duplicate'
              ? [...this.#state.duplicates, { name, itemId: r.itemId, trashed: r.trashed }]
              : this.#state.duplicates;
          this.#set({ done: this.#state.done + 1, duplicates });
          if (r.kind === 'uploaded') this.#after();
        } catch (error) {
          const id = this.#nextId++;
          this.#failedFiles.set(id, f);
          this.#set({ failed: [...this.#state.failed, { id, name, error }] });
        }
      }
    } finally {
      this.#running = false;
      this.#set({ current: null, queued: 0 });
    }
  }

  #set(patch: Partial<UploadState>): void {
    this.#state = { ...this.#state, ...patch };
    for (const fn of this.#listeners) fn();
  }
}

const UploadContext = createContext<UploadQueue | null>(null);

/** One queue per unlocked library, so uploads carry on while you look around. */
export function UploadsProvider({
  library,
  onUploaded,
  children,
}: {
  library: Library | null;
  onUploaded(): void;
  children: ReactNode;
}) {
  const queue = useMemo(
    () =>
      library
        ? new UploadQueue(
            (f, onProgress) => library.upload(f, library.roots().photos, webMedia, { onProgress }),
            onUploaded,
          )
        : null,
    // A new queue only for a new library; onUploaded changes with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [library],
  );
  // Leaving the page loses an upload in progress: warn first.
  useEffect(() => {
    if (!queue) return;
    const warn = (e: BeforeUnloadEvent) => {
      if (!queue.busy) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [queue]);
  return createElement(UploadContext.Provider, { value: queue }, children);
}

const noQueue = { subscribe: () => () => {}, snapshot: () => EMPTY };

export function useUploads(): { queue: UploadQueue | null; state: UploadState } {
  const queue = useContext(UploadContext);
  const source = queue ?? noQueue;
  const subscribe = useCallback((fn: () => void) => source.subscribe(fn), [source]);
  const state = useSyncExternalStore(subscribe, () => source.snapshot());
  return { queue, state };
}
