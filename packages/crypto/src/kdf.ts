import { CryptoError } from './errors.ts';
import { lib, requireLength } from './sodium.ts';

export type KdfParams = { opsLimit: number; memLimitBytes: number };

/** Argon2id MODERATE (ADR 0002). Stored with each wrapped key so it can be raised later. */
export const DEFAULT_KDF: KdfParams = { opsLimit: 3, memLimitBytes: 268435456 };

/**
 * Accepted range for stored KDF parameters (ADR 0002). The box returns these next to
 * each wrapped key, so a malicious box must not be able to weaken them (floor) or
 * exhaust a phone's memory or CPU (ceiling). Floor = libsodium INTERACTIVE.
 */
export const KDF_LIMITS = {
  minOpsLimit: 2,
  maxOpsLimit: 10,
  minMemLimitBytes: 64 * 1024 * 1024,
  maxMemLimitBytes: 1024 * 1024 * 1024,
} as const;

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
  requireKdfParams(params);
  return s.crypto_pwhash(
    KEY_BYTES,
    new TextEncoder().encode(password.normalize('NFC')),
    salt,
    params.opsLimit,
    params.memLimitBytes,
    s.crypto_pwhash_ALG_ARGON2ID13,
  );
}

function requireKdfParams({ opsLimit, memLimitBytes }: KdfParams): void {
  const ok =
    Number.isInteger(opsLimit) &&
    Number.isInteger(memLimitBytes) &&
    opsLimit >= KDF_LIMITS.minOpsLimit &&
    opsLimit <= KDF_LIMITS.maxOpsLimit &&
    memLimitBytes >= KDF_LIMITS.minMemLimitBytes &&
    memLimitBytes <= KDF_LIMITS.maxMemLimitBytes;
  if (!ok) throw new CryptoError('invalid_input');
}
