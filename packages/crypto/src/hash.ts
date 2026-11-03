import { CryptoError } from './errors.ts';
import { lib } from './sodium.ts';

/** SHA-256, as the box checks it on uploads (Go crypto/sha256). */
export function sha256(data: Uint8Array): Uint8Array {
  return lib().crypto_hash_sha256(data);
}

export type Sha256 = { update(b: Uint8Array): void; digest(): Uint8Array };

/** Incremental SHA-256, for hashing ciphertext as it streams to the box. */
export function createSha256(): Sha256 {
  const s = lib();
  const state = s.crypto_hash_sha256_init();
  let done = false;
  return {
    update(b) {
      if (done) throw new CryptoError('invalid_input');
      s.crypto_hash_sha256_update(state, b);
    },
    digest() {
      if (done) throw new CryptoError('invalid_input');
      done = true;
      return s.crypto_hash_sha256_final(state);
    },
  };
}
