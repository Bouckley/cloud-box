import { CryptoError } from './errors.ts';
import { requireId } from './ids.ts';

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
