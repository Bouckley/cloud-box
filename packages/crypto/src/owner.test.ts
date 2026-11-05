import { beforeAll, describe, expect, it } from 'vitest';
import { authMessage, recoverMessage } from './auth.ts';
import { CryptoError } from './errors.ts';
import { ownerMessage, ownerSigningKeyPair } from './owner.ts';
import { recoverySigningKeyPair } from './recovery.ts';
import { sign, verify } from './sign.ts';
import { ready } from './sodium.ts';

beforeAll(ready);

const ID = '00112233445566778899aabbccddeeff';
const CH = 'ab'.repeat(32);
const seq = (n: number, from: number) => Uint8Array.from({ length: n }, (_, i) => (from + i) & 255);

describe('owner key (ADR 0010)', () => {
  it('is the same key pair for the same master key, and different for another', () => {
    const a = ownerSigningKeyPair(seq(32, 1));
    expect(ownerSigningKeyPair(seq(32, 1)).publicKey).toEqual(a.publicKey);
    expect(ownerSigningKeyPair(seq(32, 2)).publicKey).not.toEqual(a.publicKey);
    expect(a.publicKey).toHaveLength(32);
  });

  it('is not the recovery signing key of the same 32 bytes', () => {
    const bytes = seq(32, 7);
    const rk = { entropy: bytes, words: [] };
    expect(ownerSigningKeyPair(bytes).publicKey).not.toEqual(recoverySigningKeyPair(rk).publicKey);
  });

  it('refuses a master key that is not 32 bytes', () => {
    expect(() => ownerSigningKeyPair(new Uint8Array(31))).toThrow(CryptoError);
  });

  it('signs cloudbox/v1/owner/<deviceId>/<challenge>, apart from the other messages', () => {
    const m = ownerMessage(ID, CH);
    expect(new TextDecoder().decode(m)).toBe(`cloudbox/v1/owner/${ID}/${CH}`);
    expect(m).not.toEqual(authMessage(ID, CH));
    expect(m).not.toEqual(recoverMessage(ID, new Uint8Array(32), CH));
    const kp = ownerSigningKeyPair(seq(32, 3));
    expect(verify(kp.publicKey, m, sign(kp.privateKey, m))).toBe(true);
  });

  it('refuses a bad device id or challenge', () => {
    expect(() => ownerMessage('nope', CH)).toThrow(CryptoError);
    expect(() => ownerMessage(ID, 'AB'.repeat(32))).toThrow(CryptoError);
  });
});
