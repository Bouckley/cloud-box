import type { KdfParams } from '@cloudbox/crypto';

/** Persistent key-value storage (IndexedDB in the browser, SecureStore on the phone). */
export type KeyValueStore = {
  get(k: string): Promise<unknown>;
  set(k: string, v: unknown): Promise<void>;
  delete(k: string): Promise<void>;
};

/** What core needs from the app it runs in. */
export type Platform = {
  fetch: typeof fetch;
  store: KeyValueStore;
  /** Argon2id; the web app runs it in a worker so the page stays responsive. */
  deriveKek(password: string, salt: Uint8Array, kdf: KdfParams): Promise<Uint8Array>;
};
