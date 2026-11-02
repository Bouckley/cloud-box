import { lib, requireLength } from './sodium.ts';

export type KdfParams = { opsLimit: number; memLimitBytes: number };

/** Argon2id MODERATE (ADR 0002). Stored with each wrapped key so it can be raised later. */
export const DEFAULT_KDF: KdfParams = { opsLimit: 3, memLimitBytes: 268435456 };

const SALT_BYTES = 16;
const KEY_BYTES = 32;

export function newSalt(): Uint8Array {
  return lib().randombytes_buf(SALT_BYTES);
}

/** Derives the 32-byte key-encryption key from a password (NFC-normalised, UTF-8). */
export function deriveKek(
  password: string,
  salt: Uint8Array,
  params: KdfParams = DEFAULT_KDF,
): Uint8Array {
  const s = lib();
  requireLength(salt, SALT_BYTES);
  return s.crypto_pwhash(
    KEY_BYTES,
    new TextEncoder().encode(password.normalize('NFC')),
    salt,
    params.opsLimit,
    params.memLimitBytes,
    s.crypto_pwhash_ALG_ARGON2ID13,
  );
}
