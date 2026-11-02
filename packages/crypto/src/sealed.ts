import { CryptoError } from './errors.ts';
import { lib, requireLength } from './sodium.ts';

export type KeyPair = { publicKey: Uint8Array; privateKey: Uint8Array };

const SEED_BYTES = 32;

/** X25519 key pair for receiving shared keys. */
export function generateBoxKeyPair(): KeyPair {
  const { publicKey, privateKey } = lib().crypto_box_keypair();
  return { publicKey, privateKey };
}

export function boxKeyPairFromSeed(seed: Uint8Array): KeyPair {
  const s = lib();
  requireLength(seed, SEED_BYTES);
  const { publicKey, privateKey } = s.crypto_box_seed_keypair(seed);
  return { publicKey, privateKey };
}

/** Anonymous encryption to a public key (crypto_box_seal). Adds 48 bytes. */
export function sealTo(publicKey: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const s = lib();
  requireLength(publicKey, 32);
  return s.crypto_box_seal(plaintext, publicKey);
}

export function openSealed(keyPair: KeyPair, ciphertext: Uint8Array): Uint8Array {
  const s = lib();
  requireLength(keyPair.publicKey, 32);
  requireLength(keyPair.privateKey, 32);
  try {
    return s.crypto_box_seal_open(ciphertext, keyPair.publicKey, keyPair.privateKey);
  } catch {
    throw new CryptoError('decrypt_failed');
  }
}
