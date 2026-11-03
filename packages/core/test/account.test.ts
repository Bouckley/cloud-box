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

type Hook = (url: URL) => Promise<Response | undefined>;

/** A platform whose fetch runs hook first; a Response from the hook replaces the box's. */
function hooked(hook: { fn: Hook | null }): Platform {
  const p = nodePlatform(box.fetch);
  p.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const replaced = hook.fn ? await hook.fn(new URL(req.url)) : undefined;
    return replaced ?? box.fetch(req);
  }) as typeof fetch;
  return p;
}

/** Sets holder to run fn once, the first time a request goes to path. */
function once(
  holder: { fn: Hook | null },
  path: string,
  fn: () => Promise<Response | undefined>,
): { fn: Hook | null } {
  holder.fn = async (url) => {
    if (url.pathname !== path) return undefined;
    holder.fn = null;
    return fn();
  };
  return holder;
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

  it('an expired login challenge keeps the device key', async () => {
    const hook: { fn: Hook | null } = { fn: null };
    const p = hooked(hook);
    await setUp(p);
    once(hook, '/v1/auth/verify', async () => {
      await box.advanceClock(61);
      return undefined;
    });
    expect(await Box.connect(box.baseUrl, p).login()).toBe('ok');
    expect(await p.store.get('device')).toBeDefined();
  });

  it('a mistyped pairing code keeps a paired device', async () => {
    const { p, me } = await setUp();
    const { code } = await me.createPairingCode();
    const wrong = code.slice(0, -1) + (code.endsWith('0') ? '1' : '0');
    await expect(Box.connect(box.baseUrl, p).pair(wrong, 'Again')).rejects.toThrow();
    expect(await Box.connect(box.baseUrl, p).login()).toBe('ok');
  });

  it('a failed reset keeps the device', async () => {
    const hook: { fn: Hook | null } = { fn: null };
    const p = hooked(hook);
    const { words } = await setUp(p);
    once(hook, '/v1/recovery/reset', async () =>
      Response.json({ code: 'internal_error', message: 'x', action: 'y' }, { status: 500 }),
    );
    await expect(
      Box.connect(box.baseUrl, p).resetWithRecovery(words.join(' '), 'after the reset', 'X'),
    ).rejects.toThrow();
    expect(await Box.connect(box.baseUrl, p).login()).toBe('ok');
  });

  it('an expired reset challenge is retried, not reported as the wrong key', async () => {
    const { words } = await setUp();
    const hook = once({ fn: null }, '/v1/recovery/reset', async () => {
      await box.advanceClock(61);
      return undefined;
    });
    const reset = await Box.connect(box.baseUrl, hooked(hook)).resetWithRecovery(
      words.join(' '),
      'after the reset',
      'New laptop',
    );
    expect((await reset.devices()).filter((d) => d.revokedAt === null)).toHaveLength(1);
  });

  it('session expiry retries a request with a body', async () => {
    const { me } = await setUp();
    await box.advanceClock(61 * 60);
    await me.renameDevice(me.deviceId, 'Renamed after expiry');
    await box.advanceClock(61 * 60);
    await me.changePassword('changed after expiry');
    const named = (await me.devices()).find((d) => d.isThis);
    expect(named?.name).toBe('Renamed after expiry');
  });

  it('never stores a plaintext device name', async () => {
    const { me } = await setUp();
    const p2 = await pairSecond(me, 'Phone-7741');
    const stored = await p2.store.get('device');
    expect(JSON.stringify(stored)).not.toContain('Phone-7741');
    await Box.connect(box.baseUrl, p2).unlock(PASSWORD);
    const named = (await me.devices()).find((d) => !d.isThis);
    expect(named?.name).toBe('Phone-7741');
  });
});
