import { describe, expect, it } from 'vitest';
import { authMessage, CryptoError } from './index.ts';

const ID = '00112233445566778899aabbccddeeff';
const CHALLENGE = 'ab'.repeat(32);

describe('authMessage', () => {
  it('is the UTF-8 of cloudbox/v1/auth/<deviceId>/<challenge>', () => {
    expect(new TextDecoder().decode(authMessage(ID, CHALLENGE))).toBe(
      `cloudbox/v1/auth/${ID}/${CHALLENGE}`,
    );
  });

  it.each(['ab'.repeat(31), 'ab'.repeat(33), 'AB'.repeat(32), 'zz'.repeat(32)])(
    'rejects challenge %j',
    (bad) => {
      expect(() => authMessage(ID, bad)).toThrow(CryptoError);
    },
  );

  it('rejects a device id that is not an id', () => {
    expect(() => authMessage('device-1', CHALLENGE)).toThrow(CryptoError);
  });
});
