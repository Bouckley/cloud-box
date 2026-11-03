import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newRecoveryKey, ready } from '@cloudbox/crypto';
import { startBoxd, type RunningBox } from '@cloudbox/testbox';
import { Box, ClientError, type Platform, type Unlocked } from '../src/index.ts';
import { nodePlatform } from '../src/testing.ts';

const FAST_KDF = { opsLimit: 2, memLimitBytes: 67108864 };
const PASSWORD = 'correct horse battery staple';

let box: RunningBox;
beforeAll(ready);
beforeEach(async () => {
  box = await startBoxd();
});
afterEach(async () => {
  await box?.stop();
});

function platform(): Platform {
  return nodePlatform(box.fetch);
}

async function setUp(p = platform()): Promise<{ p: Platform; me: Unlocked; words: string[] }> {
  await box.pressButton();
  const prepared = await Box.connect(box.baseUrl, p).prepareSetup({
    password: PASSWORD,
    deviceName: 'Laptop',
    kdf: FAST_KDF,
  });
  expect(prepared.recoveryWords).toHaveLength(24);
  const me = await prepared.commit();
  return { p, me, words: prepared.recoveryWords };
}

async function pairSecond(me: Unlocked, name = 'Phone'): Promise<Platform> {
  const p = platform();
  const { code } = await me.createPairingCode();
  await Box.connect(box.baseUrl, p).pair(code, name);
  return p;
}

async function clientError(promise: Promise<unknown>): Promise<ClientError> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof ClientError) return e;
    throw e;
  }
  throw new Error('expected a ClientError');
}

describe('accounts on a real box', () => {
  it('setup then unlock', async () => {
    const { p, me } = await setUp();
    expect(me.userId).toMatch(/^[0-9a-f]{32}$/);
    const devices = await me.devices();
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({
      id: me.deviceId,
      name: 'Laptop',
      isThis: true,
      revokedAt: null,
    });
    me.lock();

    const again = Box.connect(box.baseUrl, p);
    expect(await again.info()).toMatchObject({ setUp: true });
    expect(await again.login()).toBe('ok');
    const unlocked = await again.unlock(PASSWORD);
    expect(unlocked.userId).toBe(me.userId);
    expect(unlocked.deviceId).toBe(me.deviceId);
  });

  it('wrong password', async () => {
    const { p } = await setUp();
    const e = await clientError(Box.connect(box.baseUrl, p).unlock('not the password'));
    expect(e.code).toBe('wrong_password');
  });

  it('pair a second device', async () => {
    const { me } = await setUp();
    const p2 = await pairSecond(me, 'Phone');
    const second = (await me.devices()).find((d) => !d.isThis);
    expect(second?.name).toBeNull();
    const phone = await Box.connect(box.baseUrl, p2).unlock(PASSWORD);
    expect(phone.userId).toBe(me.userId);
    const named = (await me.devices()).find((d) => d.id === phone.deviceId);
    expect(named?.name).toBe('Phone');
  });

  it('forgot password', async () => {
    const { p, me, words } = await setUp();
    const p2 = await pairSecond(me);
    const unlocked = await Box.connect(box.baseUrl, p).unlockWithRecovery(
      words.join(' '),
      'a brand new password',
    );
    expect(unlocked.userId).toBe(me.userId);
    expect((await clientError(Box.connect(box.baseUrl, p).unlock(PASSWORD))).code).toBe(
      'wrong_password',
    );
    await Box.connect(box.baseUrl, p).unlock('a brand new password');
    await Box.connect(box.baseUrl, p2).unlock('a brand new password');
    const active = (await unlocked.devices()).filter((d) => d.revokedAt === null);
    expect(active).toHaveLength(2);
  });

  it('recovery reset', async () => {
    const { p, me, words } = await setUp();
    const p2 = await pairSecond(me);
    const fresh = platform();
    const reset = await Box.connect(box.baseUrl, fresh).resetWithRecovery(
      words.join(' '),
      'after the reset',
      'New laptop',
    );
    expect(reset.userId).toBe(me.userId);
    expect(await Box.connect(box.baseUrl, p).login()).toBe('revoked');
    expect(await Box.connect(box.baseUrl, p2).login()).toBe('revoked');
    const active = (await reset.devices()).filter((d) => d.revokedAt === null);
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ id: reset.deviceId, name: 'New laptop', isThis: true });
    reset.lock();
    await Box.connect(box.baseUrl, fresh).unlock('after the reset');
  });

  it('wrong recovery key', async () => {
    const { p, me } = await setUp();
    const other = newRecoveryKey().words.join(' ');
    const fresh = platform();
    expect(
      (
        await clientError(
          Box.connect(box.baseUrl, fresh).resetWithRecovery(other, 'x'.repeat(12), 'X'),
        )
      ).code,
    ).toBe('wrong_recovery_key');
    expect(await fresh.store.get('device')).toBeUndefined();
    expect(
      (await clientError(Box.connect(box.baseUrl, p).unlockWithRecovery(other, 'x'.repeat(12))))
        .code,
    ).toBe('wrong_recovery_key');
    // The box is untouched: the device is active and the old password works.
    expect((await me.devices()).filter((d) => d.revokedAt === null)).toHaveLength(1);
    await Box.connect(box.baseUrl, p).unlock(PASSWORD);
  });

  it('mistyped words', async () => {
    const { p, words } = await setUp();
    const typo = [...words];
    typo[4] = 'zzzz';
    const e = await clientError(
      Box.connect(box.baseUrl, p).unlockWithRecovery(typo.join(' '), 'x'.repeat(12)),
    );
    expect(e.code).toBe('recovery_words');
    expect(e.detail).toEqual({ reason: 'unknown_word', index: 5 });
  });

  it('TestReloginAfterExpiry', async () => {
    const { me } = await setUp();
    await me.status();
    await box.advanceClock(61 * 60);
    const status = await me.status();
    expect(status.devices).toHaveLength(1);
  });

  it('revoked device', async () => {
    const { me } = await setUp();
    const p2 = await pairSecond(me);
    const phone = await Box.connect(box.baseUrl, p2).unlock(PASSWORD);
    await me.revokeDevice(phone.deviceId);
    expect(await Box.connect(box.baseUrl, p2).login()).toBe('revoked');
    expect(await p2.store.get('device')).toBeUndefined();
    expect(await Box.connect(box.baseUrl, p2).login()).toBe('not_paired');
  });

  it('box down', async () => {
    const p = platform();
    await box.stop();
    const down = Box.connect(box.baseUrl, p);
    expect((await clientError(down.info())).code).toBe('box_unreachable');
    box = undefined as unknown as RunningBox;
  });
});
