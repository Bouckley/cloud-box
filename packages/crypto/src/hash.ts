import { lib } from './sodium.ts';

/** SHA-256, as the box checks it on uploads (Go crypto/sha256). */
export function sha256(data: Uint8Array): Uint8Array {
  return lib().crypto_hash_sha256(data);
}
