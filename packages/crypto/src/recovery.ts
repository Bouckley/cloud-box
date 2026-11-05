import { entropyToMnemonic, mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { randomKey } from './aead.ts';
import type { KeyPair } from './sealed.ts';
import { signingKeyPairFromSeed } from './sign.ts';
import { lib, requireLength } from './sodium.ts';

/** 32 random bytes and the 24 BIP39 English words that spell them (ADR 0005). */
export type RecoveryKey = { entropy: Uint8Array; words: string[] };

const WORD_COUNT = 24;
const ENTROPY_BYTES = 32;
const PREFIX_LETTERS = 4;
const KDF_CONTEXT = 'cbrecov1';
const SUBKEY_WRAP = 1;
const SUBKEY_SIGN = 2;

export type RecoveryWordsReason = 'count' | 'unknown_word' | 'checksum';

const MESSAGES: Record<RecoveryWordsReason, string> = {
  count: 'A recovery key has 24 words.',
  unknown_word: 'One of the words is not a recovery key word.',
  checksum: 'These words are not a recovery key. Check each word and its order.',
};

/**
 * The typed words are not a recovery key. `index` (1-based) names the first
 * unknown word. The message never contains the words.
 */
export class RecoveryWordsError extends Error {
  readonly reason: RecoveryWordsReason;
  readonly index: number | undefined;

  constructor(reason: RecoveryWordsReason, index?: number) {
    super(MESSAGES[reason]);
    this.name = 'RecoveryWordsError';
    this.reason = reason;
    this.index = index;
  }
}

/** Generates a new recovery key. */
export function newRecoveryKey(): RecoveryKey {
  const entropy = randomKey();
  return { entropy, words: entropyToMnemonic(entropy, wordlist).split(' ') };
}

/**
 * Reads 24 words as typed: any case, any whitespace, and each word either in
 * full or as its first 4 letters (unique in the BIP39 English list). Numbers
 * ("1." or "1)") and punctuation between words are ignored, so the key can be
 * copied as shown.
 */
export function parseRecoveryKey(text: string): RecoveryKey {
  const tokens = text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[.,;:()]/g, ' ')
    .split(/\s+/)
    .filter((t) => t !== '' && !/^\d+$/.test(t));
  if (tokens.length !== WORD_COUNT) throw new RecoveryWordsError('count');
  const words = tokens.map((t, i) => {
    const word = resolveWord(t);
    if (!word) throw new RecoveryWordsError('unknown_word', i + 1);
    return word;
  });
  let entropy: Uint8Array;
  try {
    entropy = mnemonicToEntropy(words.join(' '), wordlist);
  } catch {
    throw new RecoveryWordsError('checksum');
  }
  return { entropy, words };
}

/** A whole word, or exactly its first 4 letters; anything else is unknown. */
function resolveWord(token: string): string | undefined {
  if (wordSet.has(token)) return token;
  return token.length === PREFIX_LETTERS ? byPrefix.get(token) : undefined;
}

const wordSet = new Set(wordlist);
const byPrefix = new Map(wordlist.map((w) => [w.slice(0, PREFIX_LETTERS), w]));

function subkey(rk: RecoveryKey, id: number): Uint8Array {
  requireLength(rk.entropy, ENTROPY_BYTES);
  return lib().crypto_kdf_derive_from_key(32, id, KDF_CONTEXT, rk.entropy);
}

/** The key that wraps the master key (AD `cloudbox/v1/user/<id>/master-key/recovery`). */
export function recoveryWrapKey(rk: RecoveryKey): Uint8Array {
  return subkey(rk, SUBKEY_WRAP);
}

/** The Ed25519 key pair whose public half the box stores for recovery reset. */
export function recoverySigningKeyPair(rk: RecoveryKey): KeyPair {
  return signingKeyPairFromSeed(subkey(rk, SUBKEY_SIGN));
}
