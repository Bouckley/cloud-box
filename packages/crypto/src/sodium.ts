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
