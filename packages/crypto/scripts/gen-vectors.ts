// Generates testdata/crypto-vectors.json from @cloudbox/crypto.
// Run once and commit the output: `pnpm --filter @cloudbox/crypto gen-vectors`.
// Refuses to overwrite the committed file unless --force is passed, because
// changing vectors means every client must agree on the change (CLAUDE.md).
// --add-missing keeps every existing section byte-for-byte and only adds
// sections the file does not have yet.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ad as adFor } from '../src/ad.ts';
import { aeadEncryptWithNonce } from '../src/aead.ts';
import { authMessage } from '../src/auth.ts';
import { dedupeHash } from '../src/dedupe.ts';
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
const addMissing = process.argv.includes('--add-missing');
if (existsSync(out) && !addMissing && !process.argv.includes('--force')) {
  console.error(
    `${out} exists; pass --add-missing to add new sections, or --force to regenerate (all clients must then agree).`,
  );
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
  { ad: utf8('user:1:master-key'), plaintext: utf8('') },
  { ad: utf8('item:1:metadata'), plaintext: utf8('{"name":"IMG_0001.jpg"}') },
].map(({ ad, plaintext }) => ({
  key: hex(aeadKey),
  nonce: hex(aeadNonce),
  ad: hex(ad),
  plaintext: hex(plaintext),
  box: hex(aeadEncryptWithNonce(aeadKey, aeadNonce, plaintext, ad)),
}));

const streamKey = seq(32, 50);
const streamAd = utf8('item:1:original');
const secretstream = [0, 64, 200].map((n) => {
  const plaintext = seq(n, 7);
  return {
    key: hex(streamKey),
    ad: hex(streamAd),
    chunkBytes: 64,
    plaintext: hex(plaintext),
    ciphertext: hex(encryptFile(streamKey, plaintext, streamAd, 64)),
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

// ADR 0003 associated data. `ad` is the UTF-8 text, not hex, so it is readable.
const ID = '00112233445566778899aabbccddeeff';
const ad = [
  ['masterKeyByPassword', [ID], adFor.masterKeyByPassword(ID)],
  ['masterKeyByRecovery', [ID], adFor.masterKeyByRecovery(ID)],
  ['identityKey', [ID], adFor.identityKey(ID)],
  ['dedupeKey', [ID], adFor.dedupeKey(ID)],
  ['deviceName', [ID], adFor.deviceName(ID)],
  ['collectionKey', [ID], adFor.collectionKey(ID)],
  ['collectionName', [ID], adFor.collectionName(ID)],
  ['itemFileKey', [ID], adFor.itemFileKey(ID)],
  ['itemMetadata', [ID], adFor.itemMetadata(ID)],
  ['itemBlob', [ID, 'original'], adFor.itemBlob(ID, 'original')],
  ['itemBlob', [ID, 'preview'], adFor.itemBlob(ID, 'preview')],
  ['itemBlob', [ID, 'thumb'], adFor.itemBlob(ID, 'thumb')],
].map(([fn, args, bytes]) => ({ fn, args, ad: new TextDecoder().decode(bytes as Uint8Array) }));

// What a device signs to log in; the box rebuilds the message in Go and verifies it.
const authMessageVectors = [
  { deviceId: ID, challenge: hex(seq(32)), seed: seq(32, 20) },
  { deviceId: 'ffeeddccbbaa99887766554433221100', challenge: hex(seq(32, 128)), seed: seq(32, 21) },
].map(({ deviceId, challenge, seed }) => {
  const kp = signingKeyPairFromSeed(seed);
  const message = authMessage(deviceId, challenge);
  return {
    deviceId,
    challenge,
    message: hex(message),
    seed: hex(seed),
    publicKey: hex(kp.publicKey),
    signature: hex(sign(kp.privateKey, message)),
  };
});

const dedupeKey = seq(32, 90);
const dedupe = [utf8(''), utf8('abc'), new Uint8Array(1000).fill(0x61)].map((input) => ({
  key: hex(dedupeKey),
  input: hex(input),
  hash: dedupeHash(dedupeKey, input),
}));

// What the recovery signing key signs to reset a box (ADR 0005). `message` is
// the UTF-8 text. Built inline here; Task 7 of M2 adds recoverMessage to
// @cloudbox/crypto and checks it against these rows.
const recover = [
  { deviceId: ID, challenge: hex(seq(32, 64)), seed: seq(32, 30) },
  { deviceId: 'ffeeddccbbaa99887766554433221100', challenge: hex(seq(32, 192)), seed: seq(32, 31) },
].map(({ deviceId, challenge, seed }) => {
  const kp = signingKeyPairFromSeed(seed);
  const message = `cloudbox/v1/recover/${deviceId}/${challenge}`;
  return {
    deviceId,
    challenge,
    message,
    seed: hex(seed),
    publicKey: hex(kp.publicKey),
    signature: hex(sign(kp.privateKey, utf8(message))),
  };
});

const generated = {
  version: 1,
  note: 'Generated once by packages/crypto/scripts/gen-vectors.ts and committed. Binary values are lowercase hex. Do not edit by hand.',
  kdf,
  aead,
  secretstream,
  sealed,
  ed25519,
  sha256: sha,
  ad,
  authMessage: authMessageVectors,
  dedupe,
  recover,
};

let vectors: Record<string, unknown> = generated;
if (addMissing && existsSync(out)) {
  const existing = JSON.parse(readFileSync(out, 'utf8')) as Record<string, unknown>;
  const added = Object.keys(generated).filter((k) => !(k in existing));
  vectors = { ...existing };
  for (const k of added) vectors[k] = generated[k as keyof typeof generated];
  console.log(added.length ? `adding sections: ${added.join(', ')}` : 'no missing sections');
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(vectors, null, 2) + '\n');
console.log(`wrote ${out}`);
