export type CryptoErrorCode = 'not_ready' | 'invalid_input' | 'decrypt_failed';

const MESSAGES: Record<CryptoErrorCode, string> = {
  not_ready: 'Call ready() and wait for it before using @cloudbox/crypto.',
  invalid_input: 'An input has the wrong length or type.',
  decrypt_failed: 'Decryption failed: wrong key, wrong associated data, or damaged data.',
};

/** Errors from @cloudbox/crypto. Messages never contain keys, passwords or plaintext. */
export class CryptoError extends Error {
  readonly code: CryptoErrorCode;

  constructor(code: CryptoErrorCode) {
    super(MESSAGES[code]);
    this.name = 'CryptoError';
    this.code = code;
  }
}
