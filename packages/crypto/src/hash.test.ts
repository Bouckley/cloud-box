import { beforeAll, describe, expect, it } from 'vitest';
import { ready, sha256 } from './index.ts';

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

beforeAll(ready);

describe('sha256', () => {
  it('matches the FIPS 180-2 test values', () => {
    expect(hex(sha256(new Uint8Array()))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(hex(sha256(new TextEncoder().encode('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
