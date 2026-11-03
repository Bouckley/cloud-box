import { newId } from '@cloudbox/crypto';
import type { KeyValueStore } from './platform.ts';

const STORE_KEY = 'device';
const ED25519 = { name: 'Ed25519' } as const;

/**
 * This device's identity on the box. The private key is a non-extractable
 * WebCrypto key: scripts can use it to sign but never read it.
 */
export type DeviceRecord = {
  deviceId: string;
  keyPair: CryptoKeyPair;
  publicKey: Uint8Array;
  /** A name to encrypt and send after the next unlock (the master key is needed). */
  pendingName?: string;
};

export class DeviceKeys {
  readonly #store: KeyValueStore;

  constructor(store: KeyValueStore) {
    this.#store = store;
  }

  async load(): Promise<DeviceRecord | null> {
    const rec = (await this.#store.get(STORE_KEY)) as DeviceRecord | undefined;
    return rec ?? null;
  }

  /** Makes a new device id and key pair and stores them, replacing any old ones. */
  async create(): Promise<DeviceRecord> {
    const keyPair = (await crypto.subtle.generateKey(ED25519, false, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
    const rec: DeviceRecord = { deviceId: newId(), keyPair, publicKey };
    await this.#store.set(STORE_KEY, rec);
    return rec;
  }

  async setPendingName(name: string | undefined): Promise<void> {
    const rec = await this.load();
    if (!rec) return;
    const next: DeviceRecord = {
      deviceId: rec.deviceId,
      keyPair: rec.keyPair,
      publicKey: rec.publicKey,
    };
    if (name !== undefined) next.pendingName = name;
    await this.#store.set(STORE_KEY, next);
  }

  async clear(): Promise<void> {
    await this.#store.delete(STORE_KEY);
  }

  /** A detached Ed25519 signature (64 bytes) that libsodium verifies. */
  async sign(rec: DeviceRecord, msg: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(
      await crypto.subtle.sign(ED25519, rec.keyPair.privateKey, new Uint8Array(msg)),
    );
  }
}
