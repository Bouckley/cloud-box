import { CryptoError } from './errors.ts';
import { requireId } from './ids.ts';
import { requireLength } from './sodium.ts';

const CHALLENGE_PATTERN = /^[0-9a-f]{64}$/;

/**
 * The bytes a device signs to log in (ADR 0004):
 * UTF-8 `cloudbox/v1/auth/<deviceId>/<challengeHex>`. The box builds the same
 * message in Go (boxcrypto.AuthMessage) and verifies the Ed25519 signature.
 */
export function authMessage(deviceId: string, challengeHex: string): Uint8Array {
  requireId(deviceId);
  if (!CHALLENGE_PATTERN.test(challengeHex)) throw new CryptoError('invalid_input');
  return new TextEncoder().encode(`cloudbox/v1/auth/${deviceId}/${challengeHex}`);
}

/**
 * The bytes the recovery signing key signs to reset a box (ADR 0005): UTF-8
 * `cloudbox/v1/recover/<deviceId>/<signPublicKeyHex>/<challengeHex>`. It
 * names the new device's key, so an interceptor cannot swap in its own.
 * Matches Go boxcrypto.RecoverMessage.
 */
export function recoverMessage(
  deviceId: string,
  signPublicKey: Uint8Array,
  challengeHex: string,
): Uint8Array {
  requireId(deviceId);
  requireLength(signPublicKey, 32);
  if (!CHALLENGE_PATTERN.test(challengeHex)) throw new CryptoError('invalid_input');
  const keyHex = Array.from(signPublicKey, (x) => x.toString(16).padStart(2, '0')).join('');
  return new TextEncoder().encode(`cloudbox/v1/recover/${deviceId}/${keyHex}/${challengeHex}`);
}
