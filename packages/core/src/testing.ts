import { deriveKek } from '@cloudbox/crypto';
import type { KeyValueStore, Platform } from './platform.ts';

/** An in-memory KeyValueStore, for tests and Node. */
export function memoryStore(): KeyValueStore {
  const m = new Map<string, unknown>();
  return {
    async get(k) {
      return m.get(k);
    },
    async set(k, v) {
      m.set(k, v);
    },
    async delete(k) {
      m.delete(k);
    },
  };
}

/** A Platform for Node: the given fetch, a memory store and Argon2id on this thread. */
export function nodePlatform(fetchImpl: typeof fetch): Platform {
  return {
    fetch: fetchImpl,
    store: memoryStore(),
    deriveKek: async (password, salt, kdf) => deriveKek(password, salt, kdf),
  };
}
