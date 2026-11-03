import sodium from 'libsodium-wrappers-sumo';
import { CryptoError } from './errors.ts';

let isReady = false;

/** Loads libsodium. Await once before calling any other function. */
export async function ready(): Promise<void> {
  await sodium.ready;
  isReady = true;
}

/** The loaded libsodium instance; throws not_ready before ready() resolves. */
export function lib(): typeof sodium {
  if (!isReady) throw new CryptoError('not_ready');
  return sodium;
}

export function requireLength(bytes: Uint8Array, length: number): void {
  if (!(bytes instanceof Uint8Array) || bytes.length !== length) {
    throw new CryptoError('invalid_input');
  }
}

/** Associated data names what a ciphertext belongs to (ADR 0002); it must not be empty. */
export function requireAd(ad: Uint8Array): void {
  if (!(ad instanceof Uint8Array) || ad.length === 0) {
    throw new CryptoError('invalid_input');
  }
}

/**
 * A key that encrypts must not be all zeros: a wiped key (zero-filled on
 * lock) would otherwise produce ciphertext anyone can open.
 */
export function requireKey(key: Uint8Array, length: number): void {
  requireLength(key, length);
  if (lib().is_zero(key)) throw new CryptoError('invalid_input');
}
