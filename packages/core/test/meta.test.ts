import { beforeAll, describe, expect, it } from 'vitest';
import { ad, encryptMetadata, newId, randomKey, ready } from '@cloudbox/crypto';
import { decodeMeta, decodeName, encodeMeta, encodeName, parseMeta } from '../src/meta.ts';
import { meta } from './helpers.ts';

beforeAll(ready);

describe('item metadata', () => {
  it('meta round trip', () => {
    const key = randomKey();
    const id = newId();
    const m = meta('IMG_0001.jpg', { favourite: true, durationMs: 1200, thumbMime: 'image/webp' });
    expect(decodeMeta(key, id, encodeMeta(key, id, m))).toEqual(m);
  });

  it('bad meta is null, not a throw', () => {
    const key = randomKey();
    const id = newId();
    const good = meta('a.jpg');
    const bad: unknown[] = [
      { ...good, v: 2 },
      { ...good, name: 7 },
      { ...good, size: '3' },
      { ...good, favourite: 'yes' },
      { ...good, takenAt: 'not a date' },
      { ...good, width: -1 },
      'just a string',
      null,
    ];
    for (const b of bad) {
      expect(parseMeta(b)).toBeNull();
      expect(decodeMeta(key, id, encryptMetadata(key, b, ad.itemMetadata(id)))).toBeNull();
    }
    const missing: Record<string, unknown> = { ...good };
    delete missing.mime;
    expect(parseMeta(missing)).toBeNull();
    // Wrong key, wrong item, garbage: unreadable, never a throw.
    const enc = encodeMeta(key, id, good);
    expect(decodeMeta(randomKey(), id, enc)).toBeNull();
    expect(decodeMeta(key, newId(), enc)).toBeNull();
    expect(decodeMeta(key, id, new Uint8Array(5))).toBeNull();
  });

  it('collection names', () => {
    const key = randomKey();
    const id = newId();
    const n = { v: 1, name: 'Summer', role: null } as const;
    expect(decodeName(key, id, encodeName(key, id, n))).toEqual(n);
    expect(
      decodeName(key, id, encodeName(key, id, { v: 1, name: 'Photos', role: 'photos' }))?.role,
    ).toBe('photos');
    expect(decodeName(key, id, encryptMetadata(key, 'Holiday', ad.collectionName(id)))).toBeNull();
    expect(decodeName(randomKey(), id, encodeName(key, id, n))).toBeNull();
  });
});
