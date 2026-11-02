import { beforeAll, describe, expect, it } from 'vitest';
import {
  aeadDecrypt,
  aeadEncrypt,
  decryptMetadata,
  encryptMetadata,
  randomKey,
  ready,
  unwrapKey,
  wrapKey,
} from './index.ts';

const enc = new TextEncoder();
const ad = enc.encode('item:1:metadata');
const failsWith = (code: string) => expect.objectContaining({ code });

beforeAll(ready);

describe('aeadEncrypt / aeadDecrypt', () => {
  it('round-trips and adds 40 bytes', () => {
    const key = randomKey();
    const box = aeadEncrypt(key, enc.encode('hello'), ad);
    expect(box).toHaveLength(5 + 40);
    expect(aeadDecrypt(key, box, ad)).toEqual(enc.encode('hello'));
  });

  it('uses a fresh nonce each time', () => {
    const key = randomKey();
    expect(aeadEncrypt(key, enc.encode('x'), ad)).not.toEqual(
      aeadEncrypt(key, enc.encode('x'), ad),
    );
  });

  it('rejects wrong ad', () => {
    const key = randomKey();
    const box = aeadEncrypt(key, enc.encode('hello'), ad);
    expect(() => aeadDecrypt(key, box, enc.encode('item:2:metadata'))).toThrow(
      failsWith('decrypt_failed'),
    );
  });

  it('rejects a flipped byte', () => {
    const key = randomKey();
    const box = aeadEncrypt(key, enc.encode('hello'), ad);
    box[30]! ^= 1;
    expect(() => aeadDecrypt(key, box, ad)).toThrow(failsWith('decrypt_failed'));
  });

  it('rejects the wrong key', () => {
    const box = aeadEncrypt(randomKey(), enc.encode('hello'), ad);
    expect(() => aeadDecrypt(randomKey(), box, ad)).toThrow(failsWith('decrypt_failed'));
  });

  it('rejects input shorter than nonce + tag', () => {
    expect(() => aeadDecrypt(randomKey(), new Uint8Array(39), ad)).toThrow(
      failsWith('decrypt_failed'),
    );
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(() => aeadEncrypt(new Uint8Array(31), enc.encode('x'), ad)).toThrow(
      failsWith('invalid_input'),
    );
  });
});

describe('wrapKey / unwrapKey', () => {
  it('round-trips a 32-byte key', () => {
    const kek = randomKey();
    const key = randomKey();
    expect(unwrapKey(kek, wrapKey(kek, key, ad), ad)).toEqual(key);
  });

  it('rejects a 31-byte key', () => {
    expect(() => wrapKey(randomKey(), new Uint8Array(31), ad)).toThrow(failsWith('invalid_input'));
  });
});

describe('encryptMetadata / decryptMetadata', () => {
  it('round-trips a JSON value', () => {
    const key = randomKey();
    const value = { name: 'IMG_0001.jpg', takenAt: '2024-05-01T10:00:00Z' };
    expect(decryptMetadata(key, encryptMetadata(key, value, ad), ad)).toEqual(value);
  });
});
