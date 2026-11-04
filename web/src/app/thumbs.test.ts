import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { photo } from '../test/photos.ts';
import { BoxError, ClientError } from '@cloudbox/core';
import { ThumbCache } from './thumbs.ts';

let made = 0;
const revoked: string[] = [];
beforeEach(() => {
  made = 0;
  revoked.length = 0;
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: () => `blob:${++made}`,
    revokeObjectURL: (u: string) => revoked.push(u),
  });
});
afterEach(() => vi.unstubAllGlobals());

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('ThumbCache', () => {
  it('decrypts at most 6 at once', async () => {
    let running = 0;
    let peak = 0;
    const gates: (() => void)[] = [];
    const cache = new ThumbCache(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise<void>((r) => gates.push(r));
      running--;
      return new Blob(['x']);
    });
    for (let i = 0; i < 20; i++) cache.request(photo(`p${i}`, null), () => {});
    await tick();
    expect(running).toBe(6);
    while (gates.length) {
      gates.shift()!();
      await tick();
    }
    expect(peak).toBe(6);
  });

  it('keeps 500 and revokes the least recently used', async () => {
    const cache = new ThumbCache(async () => new Blob(['x']), { max: 3 });
    const got: string[] = [];
    for (const id of ['a', 'b', 'c']) cache.request(photo(id, null), (u) => got.push(u ?? ''));
    await tick();
    expect(got).toEqual(['blob:1', 'blob:2', 'blob:3']);
    cache.get('a'); // a is now the most recent
    cache.request(photo('d', null), () => {});
    await tick();
    expect(revoked).toEqual(['blob:2']);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe('blob:1');
  });

  it('a cancelled request never loads', async () => {
    const load = vi.fn(async () => new Blob(['x']));
    const cache = new ThumbCache(load, { concurrent: 1 });
    cache.request(photo('a', null), () => {});
    const cancel = cache.request(photo('b', null), () => {});
    cancel();
    await tick();
    await tick();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('no thumbnail means null (show the file tile), and no retry storm', async () => {
    const load = vi.fn(async () => null);
    const cache = new ThumbCache(load);
    const cb = vi.fn();
    cache.request(photo('a', null), cb);
    await tick();
    cache.request(photo('a', null), cb);
    await tick();
    expect(cb.mock.calls).toEqual([[null], [null]]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('a thumbnail that cannot be decrypted is not asked for again', async () => {
    const load = vi.fn(async () => {
      throw new ClientError('unreadable');
    });
    const cache = new ThumbCache(load);
    const cb = vi.fn();
    cache.request(photo('a', null), cb);
    await tick();
    cache.request(photo('a', null), cb);
    await tick();
    expect(cb.mock.calls).toEqual([[null], [null]]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('a network blip is retried, so tiles do not stay blank', async () => {
    let n = 0;
    const load = vi.fn(async () => {
      if (++n === 1) throw new ClientError('box_unreachable');
      return new Blob(['x']);
    });
    const cache = new ThumbCache(load, { retryMs: [1] });
    const cb = vi.fn();
    cache.request(photo('a', null), cb);
    await new Promise((r) => setTimeout(r, 20));
    expect(cb).toHaveBeenCalledWith('blob:1');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('a server error is retried too', async () => {
    let n = 0;
    const load = vi.fn(async () => {
      if (++n === 1)
        throw new BoxError(503, { error: { code: 'busy', message: 'x', action: 'y' } });
      return new Blob(['x']);
    });
    const cache = new ThumbCache(load, { retryMs: [1] });
    const cb = vi.fn();
    cache.request(photo('a', null), cb);
    await new Promise((r) => setTimeout(r, 20));
    expect(cb).toHaveBeenCalledWith('blob:1');
  });

  it('two waiters for one item share one load', async () => {
    const load = vi.fn(async () => new Blob(['x']));
    const cache = new ThumbCache(load, { concurrent: 1 });
    cache.request(photo('busy', null), () => {});
    const a = vi.fn();
    const b = vi.fn();
    cache.request(photo('a', null), a);
    cache.request(photo('a', null), b);
    await tick();
    await tick();
    await tick();
    expect(load).toHaveBeenCalledTimes(2);
    expect(a).toHaveBeenCalledWith('blob:2');
    expect(b).toHaveBeenCalledWith('blob:2');
  });

  it('keeps working after clear() (React StrictMode runs cleanup once on mount)', async () => {
    const cache = new ThumbCache(async (_item, signal) => {
      signal.throwIfAborted();
      return new Blob(['x']);
    });
    cache.clear();
    const cb = vi.fn();
    cache.request(photo('a', null), cb);
    await tick();
    expect(cb).toHaveBeenCalledWith('blob:1');
  });

  it('clear() revokes everything', async () => {
    const cache = new ThumbCache(async () => new Blob(['x']));
    cache.request(photo('a', null), () => {});
    await tick();
    cache.clear();
    expect(revoked).toEqual(['blob:1']);
  });
});
