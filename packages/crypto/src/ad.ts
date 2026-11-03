import { CryptoError } from './errors.ts';
import { requireId } from './ids.ts';

/** The three encrypted variants of an item (doc 05 `item_blobs.role`). */
export type BlobRole = 'original' | 'preview' | 'thumb';

const ROLES: readonly string[] = ['original', 'preview', 'thumb'];
const encoder = new TextEncoder();

function build(kind: 'user' | 'device' | 'collection' | 'item', id: string, field: string) {
  requireId(id);
  return encoder.encode(`cloudbox/v1/${kind}/${id}/${field}`);
}

/**
 * Associated data for every ciphertext, as fixed by ADR 0003:
 * `cloudbox/v1/<kind>/<id>/<field>`. Use these instead of writing the strings by hand.
 */
export const ad = {
  masterKeyByPassword: (userId: string) => build('user', userId, 'master-key/password'),
  masterKeyByRecovery: (userId: string) => build('user', userId, 'master-key/recovery'),
  identityKey: (userId: string) => build('user', userId, 'identity-key'),
  dedupeKey: (userId: string) => build('user', userId, 'dedupe-key'),
  deviceName: (deviceId: string) => build('device', deviceId, 'name'),
  collectionKey: (collectionId: string) => build('collection', collectionId, 'key'),
  collectionName: (collectionId: string) => build('collection', collectionId, 'name'),
  itemFileKey: (itemId: string) => build('item', itemId, 'file-key'),
  itemMetadata: (itemId: string) => build('item', itemId, 'metadata'),
  itemBlob: (itemId: string, role: BlobRole) => {
    if (!ROLES.includes(role)) throw new CryptoError('invalid_input');
    return build('item', itemId, role);
  },
} as const;
