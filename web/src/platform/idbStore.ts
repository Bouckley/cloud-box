import type { KeyValueStore } from '@cloudbox/core';

const DB = 'cloudbox';
const STORE = 'kv';

/**
 * The browser's KeyValueStore: IndexedDB database `cloudbox`, store `kv`.
 * It holds only the device record (a non-extractable CryptoKey pair and ids);
 * nothing decrypted is ever written here (scope ruling S3).
 */
export function idbStore(): KeyValueStore {
  let db: Promise<IDBDatabase> | null = null;
  const open = () =>
    (db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB is not available.'));
    }));
  const run = async <T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>) => {
    const tx = (await open()).transaction(STORE, mode);
    const req = op(tx.objectStore(STORE));
    return new Promise<T>((resolve, reject) => {
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB request failed.'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB request was aborted.'));
    });
  };
  return {
    get: (k) => run('readonly', (s) => s.get(k)),
    set: async (k, v) => {
      await run('readwrite', (s) => s.put(v, k));
    },
    delete: async (k) => {
      await run('readwrite', (s) => s.delete(k));
    },
  };
}
