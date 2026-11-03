import { CryptoError } from './errors.ts';
import { lib, requireAd, requireKey, requireLength } from './sodium.ts';

/** Plaintext bytes per secretstream chunk (ADR 0002). */
export const FILE_CHUNK_BYTES = 4194304;

const KEY_BYTES = 32;
/** Bytes before the first chunk, and added to each chunk. */
export const FILE_HEADER_BYTES = 24;
export const FILE_CHUNK_OVERHEAD = 17;
const HEADER_BYTES = FILE_HEADER_BYTES;
const CHUNK_OVERHEAD = FILE_CHUNK_OVERHEAD;

export type FileEncryptor = {
  header: Uint8Array;
  push(chunk: Uint8Array, last: boolean): Uint8Array;
};

export type FileDecryptor = {
  pull(chunk: Uint8Array): { plaintext: Uint8Array; last: boolean };
  /** Throws decrypt_failed unless the FINAL chunk was pulled. Call it before using the output. */
  finish(): void;
  readonly finished: boolean;
};

/**
 * Streams a file through secretstream. ad names the item and variant (for example
 * "item:<id>:original") and is bound to every chunk, so a box cannot swap variants.
 */
export function createFileEncryptor(key: Uint8Array, ad: Uint8Array): FileEncryptor {
  const s = lib();
  requireKey(key, KEY_BYTES);
  requireAd(ad);
  const { state, header } = s.crypto_secretstream_xchacha20poly1305_init_push(key);
  let done = false;
  return {
    header,
    push(chunk, last) {
      if (done) throw new CryptoError('invalid_input');
      done = last;
      const tag = last
        ? s.crypto_secretstream_xchacha20poly1305_TAG_FINAL
        : s.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE;
      return s.crypto_secretstream_xchacha20poly1305_push(state, chunk, ad, tag);
    },
  };
}

/** Pulls chunks made by createFileEncryptor. Callers must call finish() at the end. */
export function createFileDecryptor(
  key: Uint8Array,
  header: Uint8Array,
  ad: Uint8Array,
): FileDecryptor {
  const s = lib();
  requireLength(key, KEY_BYTES);
  requireAd(ad);
  if (header.length !== HEADER_BYTES) throw new CryptoError('decrypt_failed');
  let state: ReturnType<typeof s.crypto_secretstream_xchacha20poly1305_init_pull>;
  try {
    state = s.crypto_secretstream_xchacha20poly1305_init_pull(header, key);
  } catch {
    throw new CryptoError('decrypt_failed');
  }
  let finished = false;
  return {
    get finished() {
      return finished;
    },
    pull(chunk) {
      if (finished) throw new CryptoError('decrypt_failed');
      let result: { message: Uint8Array; tag: number } | false;
      try {
        result = s.crypto_secretstream_xchacha20poly1305_pull(state, chunk, ad);
      } catch {
        throw new CryptoError('decrypt_failed');
      }
      if (!result) throw new CryptoError('decrypt_failed');
      finished = result.tag === s.crypto_secretstream_xchacha20poly1305_TAG_FINAL;
      return { plaintext: result.message, last: finished };
    },
    finish() {
      if (!finished) throw new CryptoError('decrypt_failed');
    },
  };
}

/**
 * The size of encryptFile's output for plaintextBytes, known before encrypting:
 * header + plaintext + 17 bytes per chunk (an empty file is one chunk).
 */
export function ciphertextSize(plaintextBytes: number, chunkBytes = FILE_CHUNK_BYTES): number {
  if (!Number.isSafeInteger(plaintextBytes) || plaintextBytes < 0) {
    throw new CryptoError('invalid_input');
  }
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1) throw new CryptoError('invalid_input');
  const chunks = Math.max(1, Math.ceil(plaintextBytes / chunkBytes));
  return HEADER_BYTES + plaintextBytes + CHUNK_OVERHEAD * chunks;
}

/** Encrypts a whole file: header ‖ chunks, the last chunk tagged FINAL. */
export function encryptFile(
  key: Uint8Array,
  data: Uint8Array,
  ad: Uint8Array,
  chunkBytes = FILE_CHUNK_BYTES,
): Uint8Array {
  const enc = createFileEncryptor(key, ad);
  const chunks = Math.max(1, Math.ceil(data.length / chunkBytes));
  const out = new Uint8Array(HEADER_BYTES + data.length + chunks * CHUNK_OVERHEAD);
  out.set(enc.header);
  let offset = HEADER_BYTES;
  for (let i = 0; i < chunks; i++) {
    const ct = enc.push(data.subarray(i * chunkBytes, (i + 1) * chunkBytes), i === chunks - 1);
    out.set(ct, offset);
    offset += ct.length;
  }
  return out;
}

/**
 * Decrypts encryptFile output. Fails unless the FINAL tag is on exactly the last chunk:
 * the decryptor refuses to pull after FINAL, and a missing FINAL fails the finished check.
 */
export function decryptFile(
  key: Uint8Array,
  data: Uint8Array,
  ad: Uint8Array,
  chunkBytes = FILE_CHUNK_BYTES,
): Uint8Array {
  requireAd(ad);
  if (data.length < HEADER_BYTES + CHUNK_OVERHEAD) throw new CryptoError('decrypt_failed');
  const dec = createFileDecryptor(key, data.subarray(0, HEADER_BYTES), ad);
  const parts: Uint8Array[] = [];
  let total = 0;
  let offset = HEADER_BYTES;
  while (offset < data.length) {
    const end = Math.min(offset + chunkBytes + CHUNK_OVERHEAD, data.length);
    const { plaintext } = dec.pull(data.subarray(offset, end));
    parts.push(plaintext);
    total += plaintext.length;
    offset = end;
  }
  dec.finish();
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}
