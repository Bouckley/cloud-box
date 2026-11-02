import { beforeAll, describe, expect, it } from 'vitest';
import { boxKeyPairFromSeed, generateBoxKeyPair, openSealed, ready, sealTo } from './index.ts';

const failsWith = (code: string) => expect.objectContaining({ code });
const msg = new TextEncoder().encode('collection key');

beforeAll(ready);

describe('sealed boxes', () => {
  it('round-trips and adds 48 bytes', () => {
    const kp = generateBoxKeyPair();
    const ct = sealTo(kp.publicKey, msg);
    expect(ct).toHaveLength(msg.length + 48);
    expect(openSealed(kp, ct)).toEqual(msg);
  });

  it('fails with the wrong key pair', () => {
    const ct = sealTo(generateBoxKeyPair().publicKey, msg);
    expect(() => openSealed(generateBoxKeyPair(), ct)).toThrow(failsWith('decrypt_failed'));
  });

  it('derives the same key pair from the same seed', () => {
    const seed = new Uint8Array(32).fill(1);
    expect(boxKeyPairFromSeed(seed)).toEqual(boxKeyPairFromSeed(seed));
  });

  it('rejects a 31-byte seed', () => {
    expect(() => boxKeyPairFromSeed(new Uint8Array(31))).toThrow(failsWith('invalid_input'));
  });
});
