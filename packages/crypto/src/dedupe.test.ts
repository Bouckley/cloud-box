import { beforeAll, describe, expect, it } from 'vitest';
import { createDedupeHasher, CryptoError, dedupeHash, ready } from './index.ts';

const seq = (n: number, start = 0) => Uint8Array.from({ length: n }, (_, i) => (start + i) % 256);

beforeAll(ready);

describe('dedupe hash (keyed BLAKE2b)', () => {
  const key = seq(32);
  const data = seq(1000, 3);

  it('is 64 hex characters and stable for the same key and data', () => {
    const h = dedupeHash(key, data);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(dedupeHash(key, data)).toBe(h);
  });

  it('depends on the key', () => {
    expect(dedupeHash(seq(32, 1), data)).not.toBe(dedupeHash(key, data));
  });

  it('streaming in uneven chunks equals one-shot', () => {
    const hasher = createDedupeHasher(key);
    hasher.update(data.subarray(0, 1));
    hasher.update(data.subarray(1, 600));
    hasher.update(data.subarray(600));
    expect(hasher.digest()).toBe(dedupeHash(key, data));
  });

  it('hashes empty data', () => {
    expect(dedupeHash(key, new Uint8Array())).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([31, 33, 0])('rejects a %i-byte key', (n) => {
    expect(() => dedupeHash(seq(n), data)).toThrow(CryptoError);
    expect(() => createDedupeHasher(seq(n))).toThrow(CryptoError);
  });

  it('refuses to update or digest after digest', () => {
    const hasher = createDedupeHasher(key);
    hasher.digest();
    expect(() => hasher.update(data)).toThrow(CryptoError);
    expect(() => hasher.digest()).toThrow(CryptoError);
  });
});
