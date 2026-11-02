// Generates testdata/crypto-vectors.json from @cloudbox/crypto.
// Run once and commit the output: `pnpm --filter @cloudbox/crypto gen-vectors`.
// Refuses to overwrite the committed file unless --force is passed, because
// changing vectors means every client must agree on the change (CLAUDE.md).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aeadEncryptWithNonce } from '../src/aead.ts';
import { deriveKek } from '../src/kdf.ts';
import { sha256 } from '../src/hash.ts';
import { boxKeyPairFromSeed, sealTo } from '../src/sealed.ts';
import { sign, signingKeyPairFromSeed } from '../src/sign.ts';
import { ready } from '../src/sodium.ts';
import { encryptFile } from '../src/stream.ts';

const out = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../testdata/crypto-vectors.json',
);
if (existsSync(out) && !process.argv.includes('--force')) {
  console.error(`${out} exists; pass --force to regenerate (all clients must then agree).`);
  process.exit(1);
}

await ready();

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const utf8 = (s: string) => new TextEncoder().encode(s);
const seq = (n: number, start = 0) => Uint8Array.from({ length: n }, (_, i) => (start + i) % 256);

const KDF = { opsLimit: 2, memLimitBytes: 67108864 };
const kdf = ['correct horse battery staple', 'café', 'café'].map((password) => {
  const salt = seq(16);
  return { password, salt: hex(salt), ...KDF, key: hex(deriveKek(password, salt, KDF)) };
});

const aeadKey = seq(32);
const aeadNonce = seq(24, 100);
const aead = [
  { ad: utf8(''), plaintext: utf8('') },
  { ad: utf8('item:1:metadata'), plaintext: utf8('{"name":"IMG_0001.jpg"}') },
].map(({ ad, plaintext }) => ({
  key: hex(aeadKey),
  nonce: hex(aeadNonce),
  ad: hex(ad),
  plaintext: hex(plaintext),
  box: hex(aeadEncryptWithNonce(aeadKey, aeadNonce, plaintext, ad)),
}));

const streamKey = seq(32, 50);
const secretstream = [0, 64, 200].map((n) => {
  const plaintext = seq(n, 7);
  return {
    key: hex(streamKey),
    chunkBytes: 64,
    plaintext: hex(plaintext),
    ciphertext: hex(encryptFile(streamKey, plaintext, 64)),
  };
});

const sealed = [seq(32, 1), seq(32, 2)].map((seed, i) => {
  const kp = boxKeyPairFromSeed(seed);
  const plaintext = seq(32, 200 + i);
  return {
    seed: hex(seed),
    publicKey: hex(kp.publicKey),
    privateKey: hex(kp.privateKey),
    plaintext: hex(plaintext),
    ciphertext: hex(sealTo(kp.publicKey, plaintext)),
  };
});

const signRow = (seed: Uint8Array, message: Uint8Array) => {
  const kp = signingKeyPairFromSeed(seed);
  return {
    seed: hex(seed),
    publicKey: hex(kp.publicKey),
    message: hex(message),
    signature: hex(sign(kp.privateKey, message)),
    valid: true,
  };
};
const valid = [
  signRow(seq(32, 10), utf8('')),
  signRow(seq(32, 11), utf8('challenge:3f2a9c')),
  signRow(seq(32, 12), seq(300)),
];
const base = valid[1]!;
const flipped = base.signature.replace(/^../, (h) =>
  (parseInt(h, 16) ^ 1).toString(16).padStart(2, '0'),
);
const ed25519 = [
  ...valid,
  { ...base, message: hex(utf8('challenge:3f2a9d')), valid: false },
  { ...base, signature: flipped, valid: false },
  { ...base, publicKey: valid[0]!.publicKey, valid: false },
];

const sha = [utf8(''), utf8('abc'), new Uint8Array(1000).fill(0x61)].map((input) => ({
  input: hex(input),
  digest: hex(sha256(input)),
}));

const vectors = {
  version: 1,
  note: 'Generated once by packages/crypto/scripts/gen-vectors.ts and committed. Binary values are lowercase hex. Do not edit by hand.',
  kdf,
  aead,
  secretstream,
  sealed,
  ed25519,
  sha256: sha,
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(vectors, null, 2) + '\n');
console.log(`wrote ${out}`);
