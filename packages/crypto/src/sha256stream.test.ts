import { beforeAll, describe, expect, it } from 'vitest';
import { createSha256, sha256 } from './hash.ts';
import { ciphertextSize, encryptFile, FILE_CHUNK_BYTES } from './stream.ts';
import { randomKey } from './aead.ts';
import { ready } from './sodium.ts';

beforeAll(ready);

describe('createSha256', () => {
  it('equals sha256 of the concatenation', () => {
    const parts = [new Uint8Array([1, 2, 3]), new Uint8Array(0), new Uint8Array(70000).fill(9)];
    const h = createSha256();
    for (const p of parts) h.update(p);
    const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
      all.set(p, o);
      o += p.length;
    }
    expect(h.digest()).toEqual(sha256(all));
  });

  it('hashes nothing as the empty digest', () => {
    expect(createSha256().digest()).toEqual(sha256(new Uint8Array(0)));
  });

  it('refuses use after digest', () => {
    const h = createSha256();
    h.digest();
    expect(() => h.update(new Uint8Array(1))).toThrow();
    expect(() => h.digest()).toThrow();
  });
});

describe('ciphertextSize', () => {
  const ad = new TextEncoder().encode('item:00112233445566778899aabbccddeeff:original');
  let key: Uint8Array;
  beforeAll(() => {
    key = randomKey();
  });
  const MiB = 1024 * 1024;
  it.each([0, 1, 4 * MiB - 1, 4 * MiB, 4 * MiB + 1, 9 * MiB])('%i bytes', (n) => {
    expect(ciphertextSize(n)).toBe(encryptFile(key, new Uint8Array(n), ad).length);
  });

  it('takes the chunk size', () => {
    expect(ciphertextSize(10, 4)).toBe(encryptFile(key, new Uint8Array(10), ad, 4).length);
    expect(FILE_CHUNK_BYTES).toBe(4 * MiB);
  });

  it('rejects impossible sizes', () => {
    expect(() => ciphertextSize(-1)).toThrow();
    expect(() => ciphertextSize(1.5)).toThrow();
  });
});
