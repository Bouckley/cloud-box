import { beforeAll, describe, expect, it } from 'vitest';
import { generateSigningKeyPair, ready, sign, signingKeyPairFromSeed, verify } from './index.ts';

const msg = new TextEncoder().encode('challenge-123');

beforeAll(ready);

describe('Ed25519', () => {
  it('derives the same key pair from the same seed', () => {
    const seed = new Uint8Array(32).fill(9);
    const kp = signingKeyPairFromSeed(seed);
    expect(kp.publicKey).toHaveLength(32);
    expect(signingKeyPairFromSeed(seed)).toEqual(kp);
  });

  it('verifies its own signature', () => {
    const kp = generateSigningKeyPair();
    const sig = sign(kp.privateKey, msg);
    expect(sig).toHaveLength(64);
    expect(verify(kp.publicKey, msg, sig)).toBe(true);
  });

  it('rejects a changed message, another key, a flipped byte and a short signature', () => {
    const kp = generateSigningKeyPair();
    const sig = sign(kp.privateKey, msg);
    expect(verify(kp.publicKey, new TextEncoder().encode('challenge-124'), sig)).toBe(false);
    expect(verify(generateSigningKeyPair().publicKey, msg, sig)).toBe(false);
    const flipped = sig.slice();
    flipped[0]! ^= 1;
    expect(verify(kp.publicKey, msg, flipped)).toBe(false);
    expect(verify(kp.publicKey, msg, sig.subarray(0, 63))).toBe(false);
  });
});
