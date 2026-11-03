import { newId } from '@cloudbox/crypto';
import type { KeyValueStore } from './platform.ts';

const STORE_KEY = 'device';
const ED25519 = { name: 'Ed25519' } as const;

// Names waiting for the first unlock (the master key is needed to encrypt
// them). Memory only: no plaintext name is ever written to the store.
const pendingNames = new WeakMap<KeyValueStore, string>();

/**
 * This device's identity on the box. The private key is a non-extractable
 * WebCrypto key: scripts can use it to sign but never read it.
 */
export type DeviceRecord = {
  deviceId: string;
  keyPair: CryptoKeyPair;
  publicKey: Uint8Array;
  /** A name to encrypt and send after the next unlock. Held in memory, never stored. */
  pendingName?: string;
};

export class DeviceKeys {
  readonly #store: KeyValueStore;

  constructor(store: KeyValueStore) {
    this.#store = store;
  }

  async load(): Promise<DeviceRecord | null> {
    const stored = (await this.#store.get(STORE_KEY)) as DeviceRecord | undefined;
    if (!stored) return null;
    const rec: DeviceRecord = {
      deviceId: stored.deviceId,
      keyPair: stored.keyPair,
      publicKey: stored.publicKey,
    };
    const name = pendingNames.get(this.#store);
    if (name !== undefined) rec.pendingName = name;
    return rec;
  }

  /**
   * Makes a new device id and key pair in memory only. Call save() once the
   * box has accepted it, so a failed pairing never replaces a working key.
   */
  async generate(): Promise<DeviceRecord> {
    const keyPair = (await crypto.subtle.generateKey(ED25519, false, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
    return { deviceId: newId(), keyPair, publicKey };
  }

  /** Stores the record (never a pending name), replacing any old one. */
  async save(rec: DeviceRecord): Promise<void> {
    pendingNames.delete(this.#store);
    await this.#store.set(STORE_KEY, {
      deviceId: rec.deviceId,
      keyPair: rec.keyPair,
      publicKey: rec.publicKey,
    });
  }

  /** generate() then save(). */
  async create(): Promise<DeviceRecord> {
    const rec = await this.generate();
    await this.save(rec);
    return rec;
  }

  async setPendingName(name: string | undefined): Promise<void> {
    if (name === undefined) pendingNames.delete(this.#store);
    else pendingNames.set(this.#store, name);
  }

  async clear(): Promise<void> {
    pendingNames.delete(this.#store);
    await this.#store.delete(STORE_KEY);
  }

  /** A detached Ed25519 signature (64 bytes) that libsodium verifies. */
  async sign(rec: DeviceRecord, msg: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(
      await crypto.subtle.sign(ED25519, rec.keyPair.privateKey, new Uint8Array(msg)),
    );
  }
}
