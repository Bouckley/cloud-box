import { ad, decryptMetadata, encryptMetadata } from '@cloudbox/crypto';

/** An item's plaintext metadata (ADR 0005). Encrypted with the item's file key. */
export type ItemMeta = {
  v: 1;
  name: string;
  mime: string;
  size: number;
  /** RFC 3339, or null when unknown. */
  modifiedAt: string | null;
  takenAt: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  favourite: boolean;
  thumbMime: string | null;
  previewMime: string | null;
};

/** A collection's plaintext name. Encrypted with the collection key. */
export type CollectionName = { v: 1; name: string; role: 'photos' | 'files' | null };

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const isTime = (v: unknown): v is string =>
  typeof v === 'string' && RFC3339.test(v) && !Number.isNaN(Date.parse(v));
const orNull =
  <T>(check: (v: unknown) => v is T) =>
  (v: unknown): v is T | null =>
    v === null || check(v);
const isString = (v: unknown): v is string => typeof v === 'string';

/** Checks a decrypted value; anything of the wrong shape is null. Unknown keys are dropped. */
export function parseMeta(v: unknown): ItemMeta | null {
  if (!isObj(v) || v.v !== 1) return null;
  const ok =
    isString(v.name) &&
    isString(v.mime) &&
    isCount(v.size) &&
    orNull(isTime)(v.modifiedAt) &&
    orNull(isTime)(v.takenAt) &&
    orNull(isCount)(v.width) &&
    orNull(isCount)(v.height) &&
    orNull(isCount)(v.durationMs) &&
    typeof v.favourite === 'boolean' &&
    orNull(isString)(v.thumbMime) &&
    orNull(isString)(v.previewMime);
  if (!ok) return null;
  return {
    v: 1,
    name: v.name as string,
    mime: v.mime as string,
    size: v.size as number,
    modifiedAt: v.modifiedAt as string | null,
    takenAt: v.takenAt as string | null,
    width: v.width as number | null,
    height: v.height as number | null,
    durationMs: v.durationMs as number | null,
    favourite: v.favourite as boolean,
    thumbMime: v.thumbMime as string | null,
    previewMime: v.previewMime as string | null,
  };
}

export function encodeMeta(fileKey: Uint8Array, itemId: string, m: ItemMeta): Uint8Array {
  return encryptMetadata(fileKey, m, ad.itemMetadata(itemId));
}

/** Null when it cannot be decrypted or has the wrong shape; never throws. */
export function decodeMeta(fileKey: Uint8Array, itemId: string, enc: Uint8Array): ItemMeta | null {
  try {
    return parseMeta(decryptMetadata<unknown>(fileKey, enc, ad.itemMetadata(itemId)));
  } catch {
    return null;
  }
}

export function parseName(v: unknown): CollectionName | null {
  if (!isObj(v) || v.v !== 1 || !isString(v.name)) return null;
  if (v.role !== null && v.role !== 'photos' && v.role !== 'files') return null;
  return { v: 1, name: v.name, role: v.role };
}

export function encodeName(key: Uint8Array, collectionId: string, n: CollectionName): Uint8Array {
  return encryptMetadata(key, n, ad.collectionName(collectionId));
}

/** Null when it cannot be decrypted or has the wrong shape; never throws. */
export function decodeName(
  key: Uint8Array,
  collectionId: string,
  enc: Uint8Array,
): CollectionName | null {
  try {
    return parseName(decryptMetadata<unknown>(key, enc, ad.collectionName(collectionId)));
  } catch {
    return null;
  }
}
