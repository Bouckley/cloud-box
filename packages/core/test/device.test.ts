import { beforeAll, describe, expect, it } from 'vitest';
import { ready, verify } from '@cloudbox/crypto';
import { DeviceKeys } from '../src/device.ts';
import { memoryStore } from '../src/testing.ts';

beforeAll(ready);

describe('DeviceKeys', () => {
  it('starts empty', async () => {
    expect(await new DeviceKeys(memoryStore()).load()).toBeNull();
  });

  it('makes a key that cannot be exported', async () => {
    const rec = await new DeviceKeys(memoryStore()).create();
    expect(rec.deviceId).toMatch(/^[0-9a-f]{32}$/);
    expect(rec.publicKey).toHaveLength(32);
    expect(rec.keyPair.privateKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('pkcs8', rec.keyPair.privateKey)).rejects.toThrow();
  });

  it('survives a reload of the store', async () => {
    const store = memoryStore();
    const rec = await new DeviceKeys(store).create();
    await new DeviceKeys(store).setPendingName('Kitchen laptop');
    const again = await new DeviceKeys(store).load();
    expect(again?.deviceId).toBe(rec.deviceId);
    expect(again?.publicKey).toEqual(rec.publicKey);
    expect(again?.pendingName).toBe('Kitchen laptop');
    await new DeviceKeys(store).setPendingName(undefined);
    expect((await new DeviceKeys(store).load())?.pendingName).toBeUndefined();
    await new DeviceKeys(store).clear();
    expect(await new DeviceKeys(store).load()).toBeNull();
  });

  it('signs so that libsodium verifies', async () => {
    const keys = new DeviceKeys(memoryStore());
    const rec = await keys.create();
    const msg = new TextEncoder().encode('cloudbox/v1/auth/test');
    const sig = await keys.sign(rec, msg);
    expect(sig).toHaveLength(64);
    expect(verify(rec.publicKey, msg, sig)).toBe(true);
    expect(verify(rec.publicKey, new TextEncoder().encode('other'), sig)).toBe(false);
  });
});
