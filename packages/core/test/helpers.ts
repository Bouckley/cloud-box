import { ad, dedupeHash, encryptFile, newId, randomKey, sha256, wrapKey } from '@cloudbox/crypto';
import type { RunningBox } from '@cloudbox/testbox';
import { Box, type Platform, type Unlocked } from '../src/index.ts';
import { encodeMeta, type ItemMeta } from '../src/meta.ts';
import { nodePlatform } from '../src/testing.ts';

export const FAST_KDF = { opsLimit: 2, memLimitBytes: 67108864 };
export const PASSWORD = 'correct horse battery staple';

export type Hook = (req: Request) => Promise<Response | undefined>;

/**
 * Sets up an owner whose platform fetch runs hook.fn first: a Response from
 * it replaces the box's, and a throw is a network failure.
 */
export async function hookedOwner(
  box: RunningBox,
  hook: { fn: Hook | null },
): Promise<{ p: Platform; me: Unlocked }> {
  const p = nodePlatform((async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const replaced = hook.fn ? await hook.fn(req.clone()) : undefined;
    return replaced ?? box.fetch(req);
  }) as typeof fetch);
  await box.pressButton();
  const prepared = await Box.connect(box.baseUrl, p).prepareSetup({
    password: PASSWORD,
    deviceName: 'Laptop',
    kdf: FAST_KDF,
  });
  return { p, me: await prepared.commit() };
}

export async function setUpOwner(
  box: RunningBox,
): Promise<{ p: Platform; me: Unlocked; words: string[] }> {
  const p = nodePlatform(box.fetch);
  await box.pressButton();
  const prepared = await Box.connect(box.baseUrl, p).prepareSetup({
    password: PASSWORD,
    deviceName: 'Laptop',
    kdf: FAST_KDF,
  });
  const me = await prepared.commit();
  return { p, me, words: prepared.recoveryWords };
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');

export function meta(name: string, extra: Partial<ItemMeta> = {}): ItemMeta {
  return {
    v: 1,
    name,
    mime: 'image/jpeg',
    size: 3,
    modifiedAt: '2026-07-04T12:00:00Z',
    takenAt: '2026-07-04T12:00:00Z',
    width: 4,
    height: 3,
    durationMs: null,
    favourite: false,
    thumbMime: null,
    previewMime: null,
    ...extra,
  };
}

/**
 * Creates an item the way an upload would, straight through the API: the
 * original is a tiny encrypted blob. Returns the item id.
 */
export async function createItem(
  me: Unlocked,
  collectionId: string,
  m: ItemMeta,
  plaintext: Uint8Array = crypto.getRandomValues(new Uint8Array(3)),
): Promise<string> {
  const col = me.library.snapshot().collections.get(collectionId);
  if (!col?.key) throw new Error(`no collection ${collectionId}`);
  const id = newId();
  const fileKey = randomKey();
  const ciphertext = encryptFile(fileKey, plaintext, ad.itemBlob(id, 'original'));
  const up = await me.api.POST('/v1/uploads', {
    body: { size: ciphertext.length, sha256: hex(sha256(ciphertext)) },
  });
  await me.api.PUT('/v1/uploads/{id}/parts/{n}', {
    headers: { 'Content-Type': 'application/octet-stream' },
    params: { path: { id: up.data!.id, n: 0 } },
    body: ciphertext as unknown as string,
    bodySerializer: (b: unknown) => b as BodyInit,
  });
  const done = await me.api.POST('/v1/uploads/{id}/complete', {
    params: { path: { id: up.data!.id } },
  });
  const res = await me.api.POST('/v1/items', {
    body: {
      id,
      collectionId,
      fileKeyEnc: b64(wrapKey(col.key, fileKey, ad.itemFileKey(id))),
      metadataEnc: b64(encodeMeta(fileKey, id, m)),
      dedupeHash: dedupeHash(me.keys.dedupe, plaintext),
      blobs: { original: done.data!.id },
    },
  });
  if (!res.response.ok) throw new Error(`create item: ${res.response.status}`);
  return id;
}
