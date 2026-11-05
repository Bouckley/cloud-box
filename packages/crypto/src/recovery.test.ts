import { beforeAll, describe, expect, it } from 'vitest';
import {
  newRecoveryKey,
  parseRecoveryKey,
  recoverySigningKeyPair,
  recoveryWrapKey,
  RecoveryWordsError,
} from './recovery.ts';
import { recoverMessage } from './auth.ts';
import { sign, signingKeyPairFromSeed, verify } from './sign.ts';
import { ready } from './sodium.ts';

beforeAll(ready);

// BIP39 English, 32 zero bytes.
const ZERO_WORDS = [...Array<string>(23).fill('abandon'), 'art'];

function reason(fn: () => unknown): RecoveryWordsError {
  try {
    fn();
  } catch (e) {
    if (e instanceof RecoveryWordsError) return e;
    throw e;
  }
  throw new Error('expected RecoveryWordsError');
}

describe('recovery key', () => {
  it('round trips through its words', () => {
    const rk = newRecoveryKey();
    expect(rk.entropy).toHaveLength(32);
    expect(rk.words).toHaveLength(24);
    expect(parseRecoveryKey(rk.words.join(' '))).toEqual(rk);
    expect(newRecoveryKey().entropy).not.toEqual(rk.entropy);
  });

  it('accepts any case, extra whitespace and 4-letter prefixes', () => {
    const messy = '  ABANDON\nabandon\t' + ZERO_WORDS.slice(2, 23).join('   ') + ' art \n';
    expect(parseRecoveryKey(messy)).toEqual({ entropy: new Uint8Array(32), words: ZERO_WORDS });
    const prefixes = [...Array<string>(23).fill('aban'), 'art'].join(' ');
    expect(parseRecoveryKey(prefixes).words).toEqual(ZERO_WORDS);
  });

  // Final review I3: people copy the key as it is shown, numbered, or type
  // commas between words.
  it('accepts numbered words and punctuation between them', () => {
    const numbered = ZERO_WORDS.map((w, i) => `${i + 1}. ${w}`).join('\n');
    expect(parseRecoveryKey(numbered).words).toEqual(ZERO_WORDS);
    const tight = ZERO_WORDS.map((w, i) => `${i + 1}.${w}`).join(' ');
    expect(parseRecoveryKey(tight).words).toEqual(ZERO_WORDS);
    const other = ZERO_WORDS.map((w, i) => `${i + 1}) ${w}`).join('  ');
    expect(parseRecoveryKey(other).words).toEqual(ZERO_WORDS);
    expect(parseRecoveryKey(ZERO_WORDS.join(', ') + '.').words).toEqual(ZERO_WORDS);
    expect(parseRecoveryKey(ZERO_WORDS.join(';')).words).toEqual(ZERO_WORDS);
  });

  it('counts the words', () => {
    const e = reason(() => parseRecoveryKey(ZERO_WORDS.slice(0, 23).join(' ')));
    expect(e.reason).toBe('count');
    expect(reason(() => parseRecoveryKey('')).reason).toBe('count');
  });

  it('names the unknown word', () => {
    const words = [...ZERO_WORDS];
    words[4] = 'zzzz';
    const e = reason(() => parseRecoveryKey(words.join(' ')));
    expect(e.reason).toBe('unknown_word');
    expect(e.index).toBe(5);
    // A typo is not a prefix, and a too-short prefix is not a word.
    words[4] = 'abandoz';
    expect(reason(() => parseRecoveryKey(words.join(' '))).index).toBe(5);
    words[4] = 'aba';
    expect(reason(() => parseRecoveryKey(words.join(' '))).index).toBe(5);
  });

  it('checks the checksum', () => {
    const words = [...ZERO_WORDS];
    words[23] = 'zoo';
    expect(reason(() => parseRecoveryKey(words.join(' '))).reason).toBe('checksum');
  });

  it('never puts the words in the error message', () => {
    const words = [...ZERO_WORDS];
    words[23] = 'zoo';
    const e = reason(() => parseRecoveryKey(words.join(' ')));
    expect(e.message).not.toMatch(/abandon|zoo/);
  });

  it('derives distinct wrap and signing keys', () => {
    const rk = newRecoveryKey();
    const wrap = recoveryWrapKey(rk);
    const kp = recoverySigningKeyPair(rk);
    expect(wrap).toHaveLength(32);
    expect(kp.publicKey).toHaveLength(32);
    expect(wrap).not.toEqual(rk.entropy);
    expect(recoveryWrapKey(parseRecoveryKey(rk.words.join(' ')))).toEqual(wrap);
    expect(kp.privateKey.subarray(0, 32)).not.toEqual(wrap);
  });
});

describe('recoverMessage', () => {
  it('binds the device id, its key and the challenge', () => {
    const device = signingKeyPairFromSeed(new Uint8Array(32).fill(7));
    const id = '00112233445566778899aabbccddeeff';
    const ch = 'ab'.repeat(32);
    const msg = new TextDecoder().decode(recoverMessage(id, device.publicKey, ch));
    const keyHex = Array.from(device.publicKey, (x) => x.toString(16).padStart(2, '0')).join('');
    expect(msg).toBe(`cloudbox/v1/recover/${id}/${keyHex}/${ch}`);
    const rk = recoverySigningKeyPair(newRecoveryKey());
    const sig = sign(rk.privateKey, recoverMessage(id, device.publicKey, ch));
    const other = signingKeyPairFromSeed(new Uint8Array(32).fill(8));
    expect(verify(rk.publicKey, recoverMessage(id, other.publicKey, ch), sig)).toBe(false);
  });

  it('rejects malformed input', () => {
    const key = new Uint8Array(32);
    expect(() => recoverMessage('nope', key, 'ab'.repeat(32))).toThrow();
    expect(() =>
      recoverMessage('00112233445566778899aabbccddeeff', new Uint8Array(31), 'ab'.repeat(32)),
    ).toThrow();
    expect(() =>
      recoverMessage('00112233445566778899aabbccddeeff', key, 'AB'.repeat(32)),
    ).toThrow();
  });
});
