import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ad,
  authMessage,
  decryptFile,
  decryptMetadata,
  dedupeHash,
  deriveKek,
  encryptFile,
  encryptMetadata,
  generateBoxKeyPair,
  generateSigningKeyPair,
  newId,
  newSalt,
  randomKey,
  ready,
  sha256,
  sign,
  wrapKey,
} from '@cloudbox/crypto';
import { createBoxClient } from '../../src/index.ts';
import { startBoxd, type RunningBox } from './boxd.ts';

const MARKER = 'CLOUDBOX-PLAINTEXT-MARKER';
const FILE_NAME = 'IMG_MARKER.jpg';
const PASSWORD = 'correct horse battery staple 7741';
const FAST_KDF = { opsLimit: 2, memLimitBytes: 67108864 };

const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');
const fromB64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

async function allFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await allFiles(p)));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

/** 9 MiB of random bytes with the marker written at several offsets. */
function plaintextWithMarker(): Uint8Array {
  const big = new Uint8Array(9 << 20);
  for (let i = 0; i < big.length; i += 65536) crypto.getRandomValues(big.subarray(i, i + 65536));
  const marker = new TextEncoder().encode(MARKER);
  for (const at of [0, 4 << 20, (8 << 20) + 5, big.length - marker.length]) big.set(marker, at);
  return big;
}

describe('a real box', () => {
  let box: RunningBox;
  beforeAll(async () => {
    await ready();
    box = await startBoxd();
  });
  afterAll(async () => {
    await box?.stop();
  });

  it('encrypted round trip through a real box', async () => {
    const client = createBoxClient(box.baseUrl, box.fetch);
    const secrets: string[] = [];

    // Keys, all wrapped with ADR 0003 associated data.
    const userId = newId();
    const master = randomKey();
    const salt = newSalt();
    const kek = deriveKek(PASSWORD, salt, FAST_KDF);
    const recovery = randomKey();
    const identity = generateBoxKeyPair();
    const dedupeKey = randomKey();
    const signing = generateSigningKeyPair();
    // Stand-in for the recovery signing key until Task 7 derives it from the
    // recovery key; the box only stores its public half here.
    const recoverySigning = generateSigningKeyPair();
    const deviceId = newId();
    const wrapped = {
      masterKeyByPassword: wrapKey(kek, master, ad.masterKeyByPassword(userId)),
      masterKeyByRecovery: wrapKey(recovery, master, ad.masterKeyByRecovery(userId)),
      identityKeyEnc: wrapKey(master, identity.privateKey, ad.identityKey(userId)),
      dedupeKeyEnc: wrapKey(master, dedupeKey, ad.dedupeKey(userId)),
    };

    await box.pressButton();
    const setup = await client.POST('/v1/setup', {
      body: {
        user: {
          id: userId,
          kdf: { salt: b64(salt), ...FAST_KDF },
          masterKeyByPassword: b64(wrapped.masterKeyByPassword),
          masterKeyByRecovery: b64(wrapped.masterKeyByRecovery),
          recoveryPublicKey: b64(recoverySigning.publicKey),
          identityPublicKey: b64(identity.publicKey),
          identityKeyEnc: b64(wrapped.identityKeyEnc),
          dedupeKeyEnc: b64(wrapped.dedupeKeyEnc),
        },
        device: {
          id: deviceId,
          nameEnc: b64(encryptMetadata(master, 'Test laptop', ad.deviceName(deviceId))),
          signPublicKey: b64(signing.publicKey),
        },
      },
    });
    expect(setup.error).toBeUndefined();
    expect(setup.response.status).toBe(201);

    // Login: sign the auth message.
    const ch = await client.POST('/v1/auth/challenge', { body: { deviceId } });
    expect(ch.error).toBeUndefined();
    const challenge = ch.data!.challenge;
    const verified = await client.POST('/v1/auth/verify', {
      body: {
        deviceId,
        challenge,
        signature: b64(sign(signing.privateKey, authMessage(deviceId, challenge))),
      },
    });
    expect(verified.error).toBeUndefined();
    const token = verified.data!.token;
    secrets.push(token);
    const headers = { Authorization: `Bearer ${token}` };

    // The account round-trips the wrapped keys untouched.
    const account = await client.GET('/v1/account', { headers });
    expect(account.error).toBeUndefined();
    expect(fromB64(account.data!.masterKeyByPassword)).toEqual(wrapped.masterKeyByPassword);

    // Album.
    const colId = newId();
    const colKey = randomKey();
    const colKeyEnc = wrapKey(master, colKey, ad.collectionKey(colId));
    const col = await client.POST('/v1/collections', {
      headers,
      body: {
        id: colId,
        kind: 'album',
        parentId: null,
        nameEnc: b64(encryptMetadata(colKey, 'Holiday', ad.collectionName(colId))),
        keyEnc: b64(colKeyEnc),
      },
    });
    expect(col.error).toBeUndefined();

    // Item: encrypt the file and its metadata, upload the ciphertext.
    const itemId = newId();
    const fileKey = randomKey();
    const fileKeyEnc = wrapKey(colKey, fileKey, ad.itemFileKey(itemId));
    const plaintext = plaintextWithMarker();
    const ciphertext = encryptFile(fileKey, plaintext, ad.itemBlob(itemId, 'original'));
    const metadata = { name: FILE_NAME, takenAt: '2026-01-01' };
    const metadataEnc = encryptMetadata(fileKey, metadata, ad.itemMetadata(itemId));

    const up = await client.POST('/v1/uploads', {
      headers,
      body: { size: ciphertext.length, sha256: hex(sha256(ciphertext)) },
    });
    expect(up.error).toBeUndefined();
    const { id: uploadId, partBytes, partCount } = up.data!;
    expect(partCount).toBe(2);
    for (let n = 0; n < partCount; n++) {
      const part = await client.PUT('/v1/uploads/{id}/parts/{n}', {
        headers: { ...headers, 'Content-Type': 'application/octet-stream' },
        params: { path: { id: uploadId, n } },
        body: ciphertext.subarray(n * partBytes, (n + 1) * partBytes) as unknown as string,
        bodySerializer: (b: unknown) => b as BodyInit,
      });
      expect(part.error).toBeUndefined();
      expect(part.response.status).toBe(204);
    }
    const done = await client.POST('/v1/uploads/{id}/complete', {
      headers,
      params: { path: { id: uploadId } },
    });
    expect(done.error).toBeUndefined();
    expect(done.data!.state).toBe('verified');

    const item = await client.POST('/v1/items', {
      headers,
      body: {
        id: itemId,
        collectionId: colId,
        fileKeyEnc: b64(fileKeyEnc),
        metadataEnc: b64(metadataEnc),
        dedupeHash: dedupeHash(dedupeKey, plaintext),
        blobs: { original: done.data!.id },
      },
    });
    expect(item.error).toBeUndefined();
    expect(item.data!.state).toBe('verified');

    // Back up, then sync says replicated.
    const rep = await box.fetch(`${box.baseUrl}/dev/sim/jobs/replicate`, { method: 'POST' });
    expect(rep.status).toBe(200);
    const changes = await client.GET('/v1/items', { headers, params: { query: { since: '0' } } });
    expect(changes.error).toBeUndefined();
    const synced = changes.data!.items.find((i) => i.id === itemId);
    expect(synced?.state).toBe('replicated');

    // Download and decrypt.
    const blob = await client.GET('/v1/blobs/{id}', {
      headers,
      params: { path: { id: done.data!.id } },
      parseAs: 'arrayBuffer',
    });
    expect(blob.error).toBeUndefined();
    const downloaded = new Uint8Array(blob.data as unknown as ArrayBuffer);
    expect(downloaded.length).toBe(ciphertext.length);
    const decrypted = decryptFile(fileKey, downloaded, ad.itemBlob(itemId, 'original'));
    expect(Buffer.compare(Buffer.from(decrypted), Buffer.from(plaintext))).toBe(0);
    const meta = decryptMetadata<typeof metadata>(
      fileKey,
      fromB64(synced!.metadataEnc),
      ad.itemMetadata(itemId),
    );
    expect(meta.name).toBe(FILE_NAME);

    // Zero knowledge: nothing the box wrote holds plaintext or keys.
    const forbidden = [
      MARKER,
      FILE_NAME,
      'IMG_MARKER',
      PASSWORD,
      hex(master),
      b64(master),
      hex(fileKey),
      b64(fileKey),
    ];
    const files = await allFiles(box.dataDir);
    const blobFiles = files.filter((f) => f.includes(`${join('blobs', '')}`));
    expect(blobFiles.length).toBeGreaterThanOrEqual(2); // main and backup copies were scanned
    let scanned = 0;
    for (const f of files) {
      const data = await readFile(f);
      scanned += data.length;
      for (const s of forbidden) {
        expect(data.includes(Buffer.from(s)), `${s.slice(0, 12)}… found in ${f}`).toBe(false);
      }
    }
    expect(scanned).toBeGreaterThan(2 * ciphertext.length);

    // No secrets in logs.
    const logs = box.logs();
    expect(logs).toContain('boxd listening');
    for (const s of [
      ...secrets,
      ...Object.values(wrapped).map(b64),
      b64(fileKeyEnc),
      b64(colKeyEnc),
    ]) {
      expect(logs.includes(s), 'a secret is in the boxd log').toBe(false);
    }
  });
});
