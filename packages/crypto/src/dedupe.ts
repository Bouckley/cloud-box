import { CryptoError } from './errors.ts';
import { lib, requireLength } from './sodium.ts';

const KEY_BYTES = 32;
const HASH_BYTES = 32;

/**
 * Keyed BLAKE2b-256 (`crypto_generichash`) of a file's plaintext with the
 * user's dedupe key, as hex. The box can match duplicates without learning
 * anything about the content (doc 03).
 */
export function dedupeHash(key: Uint8Array, data: Uint8Array): string {
  requireLength(key, KEY_BYTES);
  return lib().to_hex(lib().crypto_generichash(HASH_BYTES, data, key));
}

/** Streaming form of dedupeHash for files read in chunks. */
export function createDedupeHasher(key: Uint8Array): {
  update(chunk: Uint8Array): void;
  digest(): string;
} {
  requireLength(key, KEY_BYTES);
  const sodium = lib();
  const state = sodium.crypto_generichash_init(key, HASH_BYTES);
  let done = false;
  return {
    update(chunk) {
      if (done) throw new CryptoError('invalid_input');
      sodium.crypto_generichash_update(state, chunk);
    },
    digest() {
      if (done) throw new CryptoError('invalid_input');
      done = true;
      return sodium.to_hex(sodium.crypto_generichash_final(state, HASH_BYTES));
    },
  };
}
