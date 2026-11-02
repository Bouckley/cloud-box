import type { KeyPair } from './sealed.ts';
import { lib, requireLength } from './sodium.ts';

const SEED_BYTES = 32;
const PUBLIC_KEY_BYTES = 32;
const SIGNATURE_BYTES = 64;

/** Ed25519 device key pair. privateKey is libsodium's 64-byte secret key. */
export function generateSigningKeyPair(): KeyPair {
  const { publicKey, privateKey } = lib().crypto_sign_keypair();
  return { publicKey, privateKey };
}

export function signingKeyPairFromSeed(seed: Uint8Array): KeyPair {
  const s = lib();
  requireLength(seed, SEED_BYTES);
  const { publicKey, privateKey } = s.crypto_sign_seed_keypair(seed);
  return { publicKey, privateKey };
}

/** Detached Ed25519 signature (64 bytes). */
export function sign(privateKey: Uint8Array, message: Uint8Array): Uint8Array {
  const s = lib();
  requireLength(privateKey, 64);
  return s.crypto_sign_detached(message, privateKey);
}

/** True only for a valid signature; false (never throws) for wrong lengths. */
export function verify(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean {
  const s = lib();
  if (publicKey.length !== PUBLIC_KEY_BYTES || signature.length !== SIGNATURE_BYTES) return false;
  try {
    return s.crypto_sign_verify_detached(signature, message, publicKey);
  } catch {
    return false;
  }
}
