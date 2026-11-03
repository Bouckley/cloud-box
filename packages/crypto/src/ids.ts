import { lib } from './sodium.ts';
import { CryptoError } from './errors.ts';

const ID_PATTERN = /^[0-9a-f]{32}$/;

/** A new client-generated id: 16 random bytes as 32 lowercase hex characters (ADR 0003). */
export function newId(): string {
  return lib().to_hex(lib().randombytes_buf(16));
}

/** Whether s is an id in the ADR 0003 format. */
export function isId(s: string): boolean {
  return typeof s === 'string' && ID_PATTERN.test(s);
}

export function requireId(s: string): void {
  if (!isId(s)) throw new CryptoError('invalid_input');
}
