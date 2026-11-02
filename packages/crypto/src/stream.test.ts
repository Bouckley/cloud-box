import { beforeAll, describe, expect, it } from 'vitest';
import {
  createFileDecryptor,
  createFileEncryptor,
  decryptFile,
  encryptFile,
  FILE_CHUNK_BYTES,
  randomKey,
  ready,
} from './index.ts';

const CHUNK = 64;
const HEADER = 24;
const OVERHEAD = 17;
const failsWith = (code: string) => expect.objectContaining({ code });
const AD = new TextEncoder().encode('item:1:original');

const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => i % 251);

beforeAll(ready);

describe('encryptFile / decryptFile', () => {
  it('uses 4 MiB chunks by default', () => {
    expect(FILE_CHUNK_BYTES).toBe(4194304);
  });

  it.each([0, 1, 63, 64, 128, 200])('round-trips %i bytes', (n) => {
    const key = randomKey();
    const data = bytes(n);
    const ct = encryptFile(key, data, AD, CHUNK);
    const chunks = Math.max(1, Math.ceil(n / CHUNK));
    expect(ct).toHaveLength(HEADER + n + chunks * OVERHEAD);
    expect(decryptFile(key, ct, AD, CHUNK)).toEqual(data);
  });

  it('rejects a dropped last chunk', () => {
    const key = randomKey();
    const ct = encryptFile(key, bytes(128), AD, CHUNK);
    expect(() => decryptFile(key, ct.subarray(0, HEADER + CHUNK + OVERHEAD), AD, CHUNK)).toThrow(
      failsWith('decrypt_failed'),
    );
  });

  it('rejects bytes after the final chunk', () => {
    const key = randomKey();
    const ct = encryptFile(key, bytes(100), AD, CHUNK);
    const extended = new Uint8Array(ct.length + 20);
    extended.set(ct);
    expect(() => decryptFile(key, extended, AD, CHUNK)).toThrow(failsWith('decrypt_failed'));
  });

  it('rejects a whole extra chunk after an exact-multiple file', () => {
    const key = randomKey();
    const ct = encryptFile(key, bytes(128), AD, CHUNK);
    const extended = new Uint8Array(ct.length + CHUNK + OVERHEAD);
    extended.set(ct);
    expect(() => decryptFile(key, extended, AD, CHUNK)).toThrow(failsWith('decrypt_failed'));
  });

  it('rejects swapped chunks', () => {
    const key = randomKey();
    const ct = encryptFile(key, bytes(192), AD, CHUNK);
    const size = CHUNK + OVERHEAD;
    const a = ct.slice(HEADER, HEADER + size);
    const b = ct.slice(HEADER + size, HEADER + 2 * size);
    const swapped = ct.slice();
    swapped.set(b, HEADER);
    swapped.set(a, HEADER + size);
    expect(() => decryptFile(key, swapped, AD, CHUNK)).toThrow(failsWith('decrypt_failed'));
  });

  it('rejects a flipped byte', () => {
    const key = randomKey();
    const ct = encryptFile(key, bytes(100), AD, CHUNK);
    ct[HEADER + 10]! ^= 1;
    expect(() => decryptFile(key, ct, AD, CHUNK)).toThrow(failsWith('decrypt_failed'));
  });

  it('rejects a wrong header', () => {
    const key = randomKey();
    const ct = encryptFile(key, bytes(100), AD, CHUNK);
    ct.set(encryptFile(key, bytes(1), AD, CHUNK).subarray(0, HEADER));
    expect(() => decryptFile(key, ct, AD, CHUNK)).toThrow(failsWith('decrypt_failed'));
  });

  it('rejects the wrong key', () => {
    const ct = encryptFile(randomKey(), bytes(100), AD, CHUNK);
    expect(() => decryptFile(randomKey(), ct, AD, CHUNK)).toThrow(failsWith('decrypt_failed'));
  });

  it('rejects the wrong associated data (another variant of the same item)', () => {
    const key = randomKey();
    const ct = encryptFile(key, bytes(100), new TextEncoder().encode('item:1:thumbnail'), CHUNK);
    expect(() => decryptFile(key, ct, AD, CHUNK)).toThrow(failsWith('decrypt_failed'));
  });

  it('rejects empty associated data', () => {
    const key = randomKey();
    expect(() => encryptFile(key, bytes(10), new Uint8Array(), CHUNK)).toThrow(
      failsWith('invalid_input'),
    );
    const ct = encryptFile(key, bytes(10), AD, CHUNK);
    expect(() => decryptFile(key, ct, new Uint8Array(), CHUNK)).toThrow(failsWith('invalid_input'));
  });

  it('rejects input shorter than a header', () => {
    expect(() => decryptFile(randomKey(), new Uint8Array(10), AD, CHUNK)).toThrow(
      failsWith('decrypt_failed'),
    );
  });
});

describe('streaming API', () => {
  it('decrypts three pushes through three pulls', () => {
    const key = randomKey();
    const enc = createFileEncryptor(key, AD);
    const parts = [bytes(10), bytes(20), bytes(5)];
    const cts = parts.map((p, i) => enc.push(p, i === parts.length - 1));

    const dec = createFileDecryptor(key, enc.header, AD);
    const out = cts.map((c) => dec.pull(c));
    expect(out.map((o) => o.plaintext)).toEqual(parts);
    expect(out.map((o) => o.last)).toEqual([false, false, true]);
    expect(dec.finished).toBe(true);
    expect(() => dec.finish()).not.toThrow();
    expect(() => dec.pull(cts[0]!)).toThrow(failsWith('decrypt_failed'));
  });

  it('finish() throws when the final chunk never arrived', () => {
    const key = randomKey();
    const enc = createFileEncryptor(key, AD);
    const first = enc.push(bytes(10), false);
    enc.push(bytes(10), true);

    const dec = createFileDecryptor(key, enc.header, AD);
    expect(dec.pull(first).last).toBe(false);
    expect(() => dec.finish()).toThrow(failsWith('decrypt_failed'));
  });
});
