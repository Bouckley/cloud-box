import { beforeAll, describe, expect, it } from 'vitest';
import vectors from '../../../testdata/crypto-vectors.json' with { type: 'json' };
import { ad as adFor, type BlobRole } from './ad.ts';
import { aeadDecrypt, aeadEncryptWithNonce } from './aead.ts';
import { authMessage, recoverMessage } from './auth.ts';
import { recoverySigningKeyPair, recoveryWrapKey } from './recovery.ts';
import { ownerMessage, ownerSigningKeyPair } from './owner.ts';
import { dedupeHash } from './dedupe.ts';
import { deriveKek } from './kdf.ts';
import { boxKeyPairFromSeed, openSealed } from './sealed.ts';
import { sign, signingKeyPairFromSeed, verify } from './sign.ts';
import { decryptFile } from './stream.ts';
import { sha256 } from './hash.ts';
import { ready } from './sodium.ts';

const b = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));

beforeAll(ready);

describe('crypto-vectors.json', () => {
  it('has version 1', () => {
    expect(vectors.version).toBe(1);
  });

  it.each(vectors.kdf)('kdf: $password', (v) => {
    expect(
      deriveKek(v.password, b(v.salt), { opsLimit: v.opsLimit, memLimitBytes: v.memLimitBytes }),
    ).toEqual(b(v.key));
  });

  it.each(vectors.aead)('aead: ad=$ad', (v) => {
    expect(aeadEncryptWithNonce(b(v.key), b(v.nonce), b(v.plaintext), b(v.ad))).toEqual(b(v.box));
    expect(aeadDecrypt(b(v.key), b(v.box), b(v.ad))).toEqual(b(v.plaintext));
  });

  it.each(vectors.secretstream)('secretstream: $chunkBytes-byte chunks, ad=$ad', (v) => {
    expect(decryptFile(b(v.key), b(v.ciphertext), b(v.ad), v.chunkBytes)).toEqual(b(v.plaintext));
  });

  it.each(vectors.sealed)('sealed: seed $seed', (v) => {
    const kp = boxKeyPairFromSeed(b(v.seed));
    expect(kp).toEqual({ publicKey: b(v.publicKey), privateKey: b(v.privateKey) });
    expect(openSealed(kp, b(v.ciphertext))).toEqual(b(v.plaintext));
  });

  it.each(vectors.ed25519)('ed25519: valid=$valid message=$message', (v) => {
    const kp = signingKeyPairFromSeed(b(v.seed));
    if (v.valid) {
      expect(kp.publicKey).toEqual(b(v.publicKey));
      expect(sign(kp.privateKey, b(v.message))).toEqual(b(v.signature));
    }
    expect(verify(b(v.publicKey), b(v.message), b(v.signature))).toBe(v.valid);
  });

  it.each(vectors.sha256)('sha256: $input', (v) => {
    expect(sha256(b(v.input))).toEqual(b(v.digest));
  });

  it.each(vectors.ad)('ad: $fn $args', (v) => {
    const [id, role] = v.args as [string, BlobRole?];
    const bytes =
      v.fn === 'itemBlob'
        ? adFor.itemBlob(id, role!)
        : (adFor[v.fn as Exclude<keyof typeof adFor, 'itemBlob'>] as (id: string) => Uint8Array)(
            id,
          );
    expect(new TextDecoder().decode(bytes)).toBe(v.ad);
  });

  it('ad covers every builder', () => {
    expect(new Set(vectors.ad.map((v) => v.fn))).toEqual(new Set(Object.keys(adFor)));
  });

  it.each(vectors.authMessage)('authMessage: $deviceId', (v) => {
    const message = authMessage(v.deviceId, v.challenge);
    expect(message).toEqual(b(v.message));
    const kp = signingKeyPairFromSeed(b(v.seed));
    expect(kp.publicKey).toEqual(b(v.publicKey));
    expect(sign(kp.privateKey, message)).toEqual(b(v.signature));
  });

  it.each(vectors.dedupe)('dedupe: $input', (v) => {
    expect(dedupeHash(b(v.key), b(v.input))).toBe(v.hash);
  });

  it.each(vectors.recover)('recover: $deviceId', (v) => {
    const message = recoverMessage(v.deviceId, b(v.signPublicKey), v.challenge);
    expect(new TextDecoder().decode(message)).toBe(v.message);
    const kp = signingKeyPairFromSeed(b(v.seed));
    expect(kp.publicKey).toEqual(b(v.publicKey));
    expect(sign(kp.privateKey, message)).toEqual(b(v.signature));
  });

  it.each(vectors.recovery)('recovery: $words.0 $words.1 …', (v) => {
    const rk = { entropy: b(v.entropy), words: v.words };
    expect(recoveryWrapKey(rk)).toEqual(b(v.wrapKey));
    expect(recoverySigningKeyPair(rk).publicKey).toEqual(b(v.signPublicKey));
  });

  it.each(vectors.owner)('owner: $deviceId', (v) => {
    const kp = ownerSigningKeyPair(b(v.master));
    expect(kp.publicKey).toEqual(b(v.publicKey));
    const message = ownerMessage(v.deviceId, v.challenge);
    expect(new TextDecoder().decode(message)).toBe(v.message);
    expect(sign(kp.privateKey, message)).toEqual(b(v.signature));
  });

  it('sha256 covers the empty input', () => {
    expect(vectors.sha256.some((v) => v.input === '' && v.digest.startsWith('e3b0c442'))).toBe(
      true,
    );
  });
});
