import { CryptoError } from './errors.ts';
import { lib, requireAd, requireLength } from './sodium.ts';

const KEY_BYTES = 32;
const NONCE_BYTES = 24;
const TAG_BYTES = 16;

export function randomKey(): Uint8Array {
  return lib().crypto_aead_xchacha20poly1305_ietf_keygen();
}

/** XChaCha20-Poly1305 with a random nonce. Returns nonce ‖ ciphertext ‖ tag. */
export function aeadEncrypt(key: Uint8Array, plaintext: Uint8Array, ad: Uint8Array): Uint8Array {
  return aeadEncryptWithNonce(key, lib().randombytes_buf(NONCE_BYTES), plaintext, ad);
}

/** Internal: fixed nonce, for generating test vectors only. Never reuse a nonce. */
export function aeadEncryptWithNonce(
  key: Uint8Array,
  nonce: Uint8Array,
  plaintext: Uint8Array,
  ad: Uint8Array,
): Uint8Array {
  const s = lib();
  requireLength(key, KEY_BYTES);
  requireLength(nonce, NONCE_BYTES);
  requireAd(ad);
  const ct = s.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, ad, null, nonce, key);
  const out = new Uint8Array(NONCE_BYTES + ct.length);
  out.set(nonce);
  out.set(ct, NONCE_BYTES);
  return out;
}

export function aeadDecrypt(key: Uint8Array, box: Uint8Array, ad: Uint8Array): Uint8Array {
  const s = lib();
  requireLength(key, KEY_BYTES);
  requireAd(ad);
  if (box.length < NONCE_BYTES + TAG_BYTES) throw new CryptoError('decrypt_failed');
  try {
    return s.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      box.subarray(NONCE_BYTES),
      ad,
      box.subarray(0, NONCE_BYTES),
      key,
    );
  } catch {
    throw new CryptoError('decrypt_failed');
  }
}

export function wrapKey(kek: Uint8Array, key: Uint8Array, ad: Uint8Array): Uint8Array {
  requireLength(key, KEY_BYTES);
  return aeadEncrypt(kek, key, ad);
}

export function unwrapKey(kek: Uint8Array, wrapped: Uint8Array, ad: Uint8Array): Uint8Array {
  const key = aeadDecrypt(kek, wrapped, ad);
  requireLength(key, KEY_BYTES);
  return key;
}

export function encryptMetadata(key: Uint8Array, value: unknown, ad: Uint8Array): Uint8Array {
  return aeadEncrypt(key, new TextEncoder().encode(JSON.stringify(value)), ad);
}

export function decryptMetadata<T>(key: Uint8Array, box: Uint8Array, ad: Uint8Array): T {
  return JSON.parse(new TextDecoder().decode(aeadDecrypt(key, box, ad))) as T;
}
