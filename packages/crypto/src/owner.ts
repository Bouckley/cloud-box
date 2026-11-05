import { CryptoError } from './errors.ts';
import { requireId } from './ids.ts';
import type { KeyPair } from './sealed.ts';
import { signingKeyPairFromSeed } from './sign.ts';
import { lib, requireLength } from './sodium.ts';

const KDF_CONTEXT = 'cbowner1';
const SUBKEY_OWNER = 1;
const CHALLENGE_PATTERN = /^[0-9a-f]{64}$/;

/**
 * The owner key (ADR 0010): an Ed25519 key pair derived from the master key
 * (`crypto_kdf_derive_from_key(32, 1, "cbowner1", master)`). Setup sends its
 * public half; signing a login with it makes an owner session, which the box
 * asks for before changing the password, revoking or pairing devices, or
 * deleting forever. Only someone holding the master key can make it.
 */
export function ownerSigningKeyPair(masterKey: Uint8Array): KeyPair {
  requireLength(masterKey, 32);
  return signingKeyPairFromSeed(
    lib().crypto_kdf_derive_from_key(32, SUBKEY_OWNER, KDF_CONTEXT, masterKey),
  );
}

/**
 * What the owner key signs at login, over the same challenge as the device:
 * UTF-8 `cloudbox/v1/owner/<deviceId>/<challengeHex>`. Matches Go
 * boxcrypto.OwnerMessage; testdata/crypto-vectors.json checks both.
 */
export function ownerMessage(deviceId: string, challengeHex: string): Uint8Array {
  requireId(deviceId);
  if (!CHALLENGE_PATTERN.test(challengeHex)) throw new CryptoError('invalid_input');
  return new TextEncoder().encode(`cloudbox/v1/owner/${deviceId}/${challengeHex}`);
}
