import { describe, expect, it } from 'vitest';
import { ad, CryptoError } from './index.ts';

const ID = '00112233445566778899aabbccddeeff';
const text = (b: Uint8Array) => new TextDecoder().decode(b);

// One row per line of ADR 0003's table.
const rows: [string, Uint8Array, string][] = [
  ['masterKeyByPassword', ad.masterKeyByPassword(ID), `cloudbox/v1/user/${ID}/master-key/password`],
  ['masterKeyByRecovery', ad.masterKeyByRecovery(ID), `cloudbox/v1/user/${ID}/master-key/recovery`],
  ['identityKey', ad.identityKey(ID), `cloudbox/v1/user/${ID}/identity-key`],
  ['dedupeKey', ad.dedupeKey(ID), `cloudbox/v1/user/${ID}/dedupe-key`],
  ['deviceName', ad.deviceName(ID), `cloudbox/v1/device/${ID}/name`],
  ['collectionKey', ad.collectionKey(ID), `cloudbox/v1/collection/${ID}/key`],
  ['collectionName', ad.collectionName(ID), `cloudbox/v1/collection/${ID}/name`],
  ['itemFileKey', ad.itemFileKey(ID), `cloudbox/v1/item/${ID}/file-key`],
  ['itemMetadata', ad.itemMetadata(ID), `cloudbox/v1/item/${ID}/metadata`],
  ['itemBlob original', ad.itemBlob(ID, 'original'), `cloudbox/v1/item/${ID}/original`],
  ['itemBlob preview', ad.itemBlob(ID, 'preview'), `cloudbox/v1/item/${ID}/preview`],
  ['itemBlob thumb', ad.itemBlob(ID, 'thumb'), `cloudbox/v1/item/${ID}/thumb`],
];

describe('ad (ADR 0003)', () => {
  it.each(rows)('%s', (_name, bytes, want) => {
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(text(bytes)).toBe(want);
  });

  it.each(['../x', '', ID.toUpperCase(), ID + '0'])('rejects id %j', (bad) => {
    const builders = [
      () => ad.masterKeyByPassword(bad),
      () => ad.masterKeyByRecovery(bad),
      () => ad.identityKey(bad),
      () => ad.dedupeKey(bad),
      () => ad.deviceName(bad),
      () => ad.collectionKey(bad),
      () => ad.collectionName(bad),
      () => ad.itemFileKey(bad),
      () => ad.itemMetadata(bad),
      () => ad.itemBlob(bad, 'original'),
    ];
    for (const build of builders) {
      expect(build).toThrow(CryptoError);
    }
  });

  it('rejects an unknown blob role', () => {
    // @ts-expect-error -- role is checked at runtime too
    expect(() => ad.itemBlob(ID, 'full')).toThrow(CryptoError);
  });
});
