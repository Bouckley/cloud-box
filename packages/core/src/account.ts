import type { components } from '@cloudbox/api-client';
import { createBoxClient } from '@cloudbox/api-client';
import {
  ad,
  authMessage,
  CryptoError,
  decryptMetadata,
  DEFAULT_KDF,
  encryptMetadata,
  generateBoxKeyPair,
  KDF_LIMITS,
  newId,
  newRecoveryKey,
  newSalt,
  parseRecoveryKey,
  randomKey,
  ready,
  recoverMessage,
  recoverySigningKeyPair,
  recoveryWrapKey,
  RecoveryWordsError,
  sign,
  unwrapKey,
  wrapKey,
  type KdfParams,
  type KeyPair,
  type RecoveryKey,
} from '@cloudbox/crypto';
import { DeviceKeys, type DeviceRecord } from './device.ts';
import { Library } from './library.ts';
import { BoxError, ClientError } from './errors.ts';
import type { Platform } from './platform.ts';
import {
  authedFetch,
  b64,
  fromB64,
  guardedFetch,
  must,
  type ApiClient,
  type AuthedClient,
} from './transport.ts';

export type BoxInfo = components['schemas']['BoxInfo'];
export type Status = components['schemas']['Status'];
type Account = components['schemas']['Account'];

/** The user's keys, in memory only while unlocked. */
export type Keys = { master: Uint8Array; identity: KeyPair; dedupe: Uint8Array };

export type DeviceView = {
  id: string;
  name: string | null;
  lastSeen: Date;
  revokedAt: Date | null;
  isThis: boolean;
};

export type Unlocked = {
  userId: string;
  deviceId: string;
  keys: Keys;
  api: AuthedClient;
  /** The decrypted index; roots exist and the first sync is done. */
  library: Library;
  changePassword(p: string): Promise<void>;
  devices(): Promise<DeviceView[]>;
  renameDevice(id: string, name: string): Promise<void>;
  revokeDevice(id: string): Promise<void>;
  createPairingCode(): Promise<{ code: string; expiresAt: Date }>;
  status(): Promise<Status>;
  /** Wipes the keys from memory and ends the session. */
  lock(): void;
};

export type PreparedSetup = {
  recoveryWords: string[];
  /** A new password before sending: the same keys and words, re-wrapped. */
  setPassword(password: string): Promise<void>;
  /**
   * Sends setup with this browser's name (encrypted), logs in and returns the
   * unlocked account. The name is chosen here, after the words exist, so
   * naming the browser never changes the words. Can be tried again after a
   * refusal or a failure, until it succeeds once.
   */
  commit(deviceName: string): Promise<Unlocked>;
};

export type LoginResult = 'ok' | 'not_paired' | 'revoked';

/** A connection to one box from this device. */
export class Box {
  readonly #platform: Platform;
  readonly #public: ApiClient;
  readonly #api: AuthedClient;
  readonly #device: DeviceKeys;
  #token: string | null = null;
  #login: Promise<LoginResult> | null = null;

  private constructor(baseUrl: string, platform: Platform) {
    this.#platform = platform;
    this.#device = new DeviceKeys(platform.store);
    this.#public = createBoxClient(baseUrl, guardedFetch(platform.fetch));
    this.#api = createBoxClient(
      baseUrl,
      authedFetch(platform.fetch, { token: () => this.#token, relogin: () => this.login() }),
    );
  }

  static connect(baseUrl: string, platform: Platform): Box {
    return new Box(baseUrl.replace(/\/+$/, ''), platform);
  }

  /** Whether the box is set up, and whether its setup window is open. */
  async info(): Promise<BoxInfo> {
    return must(await this.#public.GET('/v1/info'));
  }

  /**
   * Logs this device in with its key. 'not_paired' when there is no key;
   * 'revoked' when the box no longer knows it (the key is then deleted).
   * Concurrent calls share one login.
   */
  login(): Promise<LoginResult> {
    this.#login ??= this.#doLogin().finally(() => {
      this.#login = null;
    });
    return this.#login;
  }

  async #doLogin(): Promise<LoginResult> {
    await ready();
    const rec = await this.#device.load();
    if (!rec) {
      this.#token = null;
      return 'not_paired';
    }
    // A verify 401 can mean the challenge expired (60 s) or the box restarted,
    // so it is retried with a fresh challenge. Only the challenge endpoint
    // says the box does not know this device: then the key is deleted.
    for (let attempt = 0; ; attempt++) {
      const ch = await this.#public.POST('/v1/auth/challenge', {
        body: { deviceId: rec.deviceId },
      });
      if (ch.response.status === 401) {
        this.#token = null;
        await this.#device.clear();
        return 'revoked';
      }
      const { challenge } = must(ch);
      const signature = await this.#device.sign(rec, authMessage(rec.deviceId, challenge));
      const v = await this.#public.POST('/v1/auth/verify', {
        body: { deviceId: rec.deviceId, challenge, signature: b64(signature) },
      });
      if (v.response.status === 401 && attempt === 0) continue;
      this.#token = must(v).token;
      return 'ok';
    }
  }

  /**
   * Generates every key and the recovery words; nothing is sent until
   * commit(). The words never change afterwards: setPassword() re-wraps the
   * same master key, and a commit can be tried again until it finishes.
   */
  async prepareSetup(i: { password: string; kdf?: KdfParams }): Promise<PreparedSetup> {
    await ready();
    const kdf = i.kdf ?? DEFAULT_KDF;
    checkKdf(kdf);
    const userId = newId();
    const master = randomKey();
    const rk = newRecoveryKey();
    const identity = generateBoxKeyPair();
    const dedupe = randomKey();
    const byPassword = async (password: string) => {
      const salt = newSalt();
      const kek = await this.#platform.deriveKek(password, salt, kdf);
      try {
        return {
          kdf: { salt: b64(salt), ...kdf },
          masterKeyByPassword: b64(wrapKey(kek, master, ad.masterKeyByPassword(userId))),
        };
      } finally {
        kek.fill(0);
      }
    };
    let user = {
      id: userId,
      ...(await byPassword(i.password)),
      masterKeyByRecovery: b64(
        wrapKey(recoveryWrapKey(rk), master, ad.masterKeyByRecovery(userId)),
      ),
      recoveryPublicKey: b64(recoverySigningKeyPair(rk).publicKey),
      identityPublicKey: b64(identity.publicKey),
      identityKeyEnc: b64(wrapKey(master, identity.privateKey, ad.identityKey(userId))),
      dedupeKeyEnc: b64(wrapKey(master, dedupe, ad.dedupeKey(userId))),
    };

    // One device key for every attempt, so an attempt the box accepted but
    // whose answer was lost can be finished by logging in with it.
    let rec: DeviceRecord | null = null;
    let accepted = false;
    let busy = false;
    let done = false;

    const send = async (deviceName: string, device: DeviceRecord) => {
      const res = await this.#public.POST('/v1/setup', {
        body: {
          user,
          device: {
            id: device.deviceId,
            nameEnc: b64(encryptMetadata(master, deviceName, ad.deviceName(device.deviceId))),
            signPublicKey: b64(device.publicKey),
          },
        },
      });
      try {
        must(res);
      } catch (e) {
        if (!(e instanceof BoxError && e.code === 'already_set_up')) throw e;
        // Set up already: by an earlier attempt of ours only if the box
        // knows this device key.
        await this.#device.save(device);
        this.#token = null;
        if ((await this.login()) !== 'ok') {
          await this.#device.clear();
          throw e;
        }
      }
    };

    return {
      recoveryWords: rk.words,
      setPassword: async (password: string) => {
        if (accepted || busy) throw new Error('setup was already sent');
        user = { ...user, ...(await byPassword(password)) };
      },
      commit: async (deviceName: string) => {
        if (done || busy) throw new Error('setup was already sent');
        busy = true;
        try {
          rec ??= await this.#device.generate();
          if (!accepted) {
            await send(deviceName, rec);
            accepted = true;
          }
          await this.#device.save(rec);
          this.#token = null;
          await this.#requireLogin();
          const unlocked = this.#unlocked(userId, rec.deviceId, { master, identity, dedupe }, kdf);
          await unlocked.library.ensureRoots();
          done = true;
          return unlocked;
        } finally {
          busy = false;
        }
      },
    };
  }

  /** Unlocks with the password. */
  async unlock(password: string): Promise<Unlocked> {
    const { account, deviceId } = await this.#account();
    const kek = await this.#platform.deriveKek(password, fromB64(account.kdf.salt), kdfOf(account));
    let master: Uint8Array;
    try {
      master = unwrapKey(
        kek,
        fromB64(account.masterKeyByPassword),
        ad.masterKeyByPassword(account.id),
      );
    } catch (e) {
      throw e instanceof CryptoError ? new ClientError('wrong_password') : e;
    } finally {
      kek.fill(0);
    }
    return this.#finishUnlock(account, deviceId, master);
  }

  /** Forgot password on a paired device: the words unwrap the master key; a new password is set. */
  async unlockWithRecovery(words: string, newPassword: string): Promise<Unlocked> {
    const rk = parseWords(words);
    const { account, deviceId } = await this.#account();
    const master = unwrapWithRecovery(rk, account);
    const unlocked = await this.#finishUnlock(account, deviceId, master);
    await unlocked.changePassword(newPassword);
    return unlocked;
  }

  /** Joins this device with a pairing code; its name is sent after the first unlock. */
  async pair(code: string, deviceName: string): Promise<void> {
    await ready();
    const rec = await this.#device.generate();
    must(
      await this.#public.POST('/v1/devices/pair', {
        body: { code, device: { id: rec.deviceId, signPublicKey: b64(rec.publicKey) } },
      }),
    );
    await this.#device.save(rec);
    await this.#device.setPendingName(deviceName);
    this.#token = null;
  }

  /**
   * No device left: the recovery key revokes every device, adds this one and
   * sets a new password.
   */
  async resetWithRecovery(
    words: string,
    newPassword: string,
    deviceName: string,
  ): Promise<Unlocked> {
    const rk = parseWords(words);
    const signer = recoverySigningKeyPair(rk);
    const recoveryPublicKey = b64(signer.publicKey);
    const rec = await this.#device.generate();
    // The box knows the key once it issues a challenge, so a 401 from reset
    // means that challenge expired: try once more with a fresh one. The new
    // key is stored only after the box accepts it.
    for (let attempt = 0; ; attempt++) {
      const ch = await this.#public.POST('/v1/recovery/challenge', {
        body: { recoveryPublicKey },
      });
      if (ch.response.status === 401) throw new ClientError('wrong_recovery_key');
      const { challenge } = must(ch);
      const res = await this.#public.POST('/v1/recovery/reset', {
        body: {
          recoveryPublicKey,
          challenge,
          signature: b64(
            sign(signer.privateKey, recoverMessage(rec.deviceId, rec.publicKey, challenge)),
          ),
          device: { id: rec.deviceId, signPublicKey: b64(rec.publicKey) },
        },
      });
      if (res.response.status === 401 && attempt === 0) continue;
      if (res.response.status === 401) throw new ClientError('wrong_recovery_key');
      must(res);
      break;
    }
    await this.#device.save(rec);
    await this.#device.setPendingName(deviceName);
    this.#token = null;
    return this.unlockWithRecovery(words, newPassword);
  }

  async #requireLogin(): Promise<string> {
    const result = await this.login();
    if (result !== 'ok') throw new ClientError(result);
    const rec = await this.#device.load();
    if (!rec) throw new ClientError('not_paired');
    return rec.deviceId;
  }

  async #account(): Promise<{ account: Account; deviceId: string }> {
    await ready();
    const deviceId = this.#token === null ? await this.#requireLogin() : await this.#deviceId();
    const account = must(await this.#api.GET('/v1/account'));
    checkKdf(kdfOf(account));
    return { account, deviceId };
  }

  async #deviceId(): Promise<string> {
    const rec = await this.#device.load();
    if (!rec) throw new ClientError('not_paired');
    return rec.deviceId;
  }

  async #finishUnlock(account: Account, deviceId: string, master: Uint8Array): Promise<Unlocked> {
    const identity = {
      publicKey: fromB64(account.identityPublicKey),
      privateKey: unwrapKey(master, fromB64(account.identityKeyEnc), ad.identityKey(account.id)),
    };
    const dedupe = unwrapKey(master, fromB64(account.dedupeKeyEnc), ad.dedupeKey(account.id));
    const unlocked = this.#unlocked(
      account.id,
      deviceId,
      { master, identity, dedupe },
      kdfOf(account),
    );
    const rec = await this.#device.load();
    if (rec?.pendingName !== undefined) {
      await unlocked.renameDevice(deviceId, rec.pendingName);
      await this.#device.setPendingName(undefined);
    }
    await unlocked.library.ensureRoots();
    return unlocked;
  }

  #unlocked(userId: string, deviceId: string, keys: Keys, kdf: KdfParams): Unlocked {
    const api = this.#api;
    const platform = this.#platform;
    const library = new Library(api, keys);
    let locked = false;
    const open = () => {
      if (locked) throw new ClientError('locked');
    };
    return {
      userId,
      deviceId,
      keys,
      api,
      library,
      async changePassword(p) {
        open();
        const salt = newSalt();
        const kek = await platform.deriveKek(p, salt, kdf);
        const wrapped = wrapKey(kek, keys.master, ad.masterKeyByPassword(userId));
        kek.fill(0);
        must(
          await api.PUT('/v1/account/password', {
            body: { kdf: { salt: b64(salt), ...kdf }, masterKeyByPassword: b64(wrapped) },
          }),
        );
      },
      async devices() {
        open();
        const { devices } = must(await api.GET('/v1/devices'));
        return devices.map((d) => ({
          id: d.id,
          name: decryptName(keys.master, d.id, d.nameEnc),
          lastSeen: new Date(d.lastSeen),
          revokedAt: d.revokedAt ? new Date(d.revokedAt) : null,
          isThis: d.id === deviceId,
        }));
      },
      async renameDevice(id, name) {
        open();
        must(
          await api.PATCH('/v1/devices/{id}', {
            params: { path: { id } },
            body: { nameEnc: b64(encryptMetadata(keys.master, name, ad.deviceName(id))) },
          }),
        );
      },
      async revokeDevice(id) {
        open();
        must(await api.DELETE('/v1/devices/{id}', { params: { path: { id } } }));
      },
      async createPairingCode() {
        open();
        const c = must(await api.POST('/v1/devices/pairing-codes'));
        return { code: c.code, expiresAt: new Date(c.expiresAt) };
      },
      async status() {
        open();
        return must(await api.GET('/v1/status'));
      },
      lock: () => {
        locked = true;
        library.wipe();
        keys.master.fill(0);
        keys.identity.privateKey.fill(0);
        keys.dedupe.fill(0);
        this.#token = null;
      },
    };
  }
}

function kdfOf(account: Account): KdfParams {
  return { opsLimit: account.kdf.opsLimit, memLimitBytes: account.kdf.memLimitBytes };
}

/** Refuses KDF settings a box (or a bug) could use to weaken or stall unlocking. */
function checkKdf(kdf: KdfParams): void {
  const ok =
    Number.isInteger(kdf.opsLimit) &&
    Number.isInteger(kdf.memLimitBytes) &&
    kdf.opsLimit >= KDF_LIMITS.minOpsLimit &&
    kdf.opsLimit <= KDF_LIMITS.maxOpsLimit &&
    kdf.memLimitBytes >= KDF_LIMITS.minMemLimitBytes &&
    kdf.memLimitBytes <= KDF_LIMITS.maxMemLimitBytes;
  if (!ok) throw new ClientError('kdf_limits');
}

function parseWords(words: string): RecoveryKey {
  try {
    return parseRecoveryKey(words);
  } catch (e) {
    if (e instanceof RecoveryWordsError) {
      throw new ClientError(
        'recovery_words',
        e.index === undefined ? { reason: e.reason } : { reason: e.reason, index: e.index },
      );
    }
    throw e;
  }
}

function unwrapWithRecovery(rk: RecoveryKey, account: Account): Uint8Array {
  const key = recoveryWrapKey(rk);
  try {
    return unwrapKey(key, fromB64(account.masterKeyByRecovery), ad.masterKeyByRecovery(account.id));
  } catch (e) {
    throw e instanceof CryptoError ? new ClientError('wrong_recovery_key') : e;
  } finally {
    key.fill(0);
  }
}

function decryptName(master: Uint8Array, id: string, nameEnc: string | null): string | null {
  if (nameEnc === null) return null;
  try {
    const name = decryptMetadata<unknown>(master, fromB64(nameEnc), ad.deviceName(id));
    return typeof name === 'string' ? name : null;
  } catch {
    return null;
  }
}
