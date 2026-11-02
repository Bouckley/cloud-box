import { beforeAll, describe, expect, it } from 'vitest';
import { CryptoError, DEFAULT_KDF, deriveKek, newSalt, ready } from './index.ts';

const FAST = { opsLimit: 2, memLimitBytes: 64 * 1024 * 1024 };
const salt = new Uint8Array(16).fill(7);

beforeAll(ready);

describe('deriveKek', () => {
  it('is deterministic for the same password, salt and params', () => {
    const a = deriveKek('correct horse', salt, FAST);
    expect(a).toHaveLength(32);
    expect(deriveKek('correct horse', salt, FAST)).toEqual(a);
  });

  it('changes with the salt', () => {
    expect(deriveKek('correct horse', newSalt(), FAST)).not.toEqual(
      deriveKek('correct horse', salt, FAST),
    );
  });

  it('normalizes to NFC', () => {
    expect(deriveKek('café', salt, FAST)).toEqual(deriveKek('café', salt, FAST));
  });

  it('rejects a salt that is not 16 bytes', () => {
    expect(() => deriveKek('pw', new Uint8Array(15), FAST)).toThrow(
      expect.objectContaining({ code: 'invalid_input' }),
    );
    expect(() => deriveKek('pw', new Uint8Array(15), FAST)).toThrow(CryptoError);
  });
});

describe('DEFAULT_KDF', () => {
  it('is Argon2id MODERATE: ops 3, 256 MiB', () => {
    expect(DEFAULT_KDF).toEqual({ opsLimit: 3, memLimitBytes: 268435456 });
  });
});

describe('newSalt', () => {
  it('returns 16 random bytes', () => {
    expect(newSalt()).toHaveLength(16);
    expect(newSalt()).not.toEqual(newSalt());
  });
});
