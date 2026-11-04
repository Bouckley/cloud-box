import type { SourceFile, UploadResult } from '@cloudbox/core';
import { describe, expect, it, vi } from 'vitest';
import { UploadQueue } from './uploads.ts';

const file = (name: string, size = 10): SourceFile => ({
  name,
  type: 'image/jpeg',
  size,
  lastModified: 0,
  slice: async () => new Uint8Array(),
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('UploadQueue', () => {
  it('sends one file at a time, in order, reporting progress', async () => {
    const calls: { name: string; d: ReturnType<typeof deferred<UploadResult>> }[] = [];
    const q = new UploadQueue((f, onProgress) => {
      const d = deferred<UploadResult>();
      calls.push({ name: f.name, d });
      onProgress(5, 10);
      return d.promise;
    });
    q.add([file('a.jpg'), file('b.jpg'), file('c.jpg')]);
    await tick();
    expect(calls.map((c) => c.name)).toEqual(['a.jpg']);
    expect(q.snapshot()).toMatchObject({
      total: 3,
      done: 0,
      queued: 2,
      current: { name: 'a.jpg', sent: 5, total: 10 },
    });
    expect(q.busy).toBe(true);
    calls[0]!.d.resolve({ kind: 'uploaded', itemId: 'A' });
    await tick();
    expect(calls.map((c) => c.name)).toEqual(['a.jpg', 'b.jpg']);
    expect(q.snapshot()).toMatchObject({ done: 1, queued: 1 });
    calls[1]!.d.resolve({ kind: 'uploaded', itemId: 'B' });
    await tick();
    calls[2]!.d.resolve({ kind: 'uploaded', itemId: 'C' });
    await tick();
    expect(q.snapshot()).toMatchObject({ done: 3, queued: 0, current: null, total: 3 });
    expect(q.busy).toBe(false);
  });

  it('lists duplicates and failures; a failure can be tried again', async () => {
    let fail = true;
    const q = new UploadQueue(async (f) => {
      if (f.name === 'dup.jpg') return { kind: 'duplicate', itemId: 'D', trashed: false };
      if (f.name === 'old.jpg') return { kind: 'duplicate', itemId: 'T', trashed: true };
      if (fail) throw new Error('boom');
      return { kind: 'uploaded', itemId: 'X' };
    });
    q.add([file('dup.jpg'), file('old.jpg'), file('bad.jpg')]);
    await tick();
    await tick();
    const s = q.snapshot();
    expect(s.duplicates).toEqual([
      { name: 'dup.jpg', itemId: 'D', trashed: false },
      { name: 'old.jpg', itemId: 'T', trashed: true },
    ]);
    expect(s.failed.map((f) => f.name)).toEqual(['bad.jpg']);
    fail = false;
    q.retry(s.failed[0]!.id);
    await tick();
    expect(q.snapshot().failed).toEqual([]);
    expect(q.snapshot().done).toBe(3);
  });

  it('tells listeners and runs after each upload', async () => {
    const after = vi.fn();
    const q = new UploadQueue(async () => ({ kind: 'uploaded', itemId: 'A' }), after);
    const fn = vi.fn();
    q.subscribe(fn);
    q.add([file('a.jpg')]);
    await tick();
    expect(fn).toHaveBeenCalled();
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('closing clears the results once idle; a new batch counts from 1', async () => {
    const q = new UploadQueue(async () => ({ kind: 'duplicate', itemId: 'D', trashed: false }));
    q.add([file('a.jpg')]);
    await tick();
    q.close();
    expect(q.snapshot()).toMatchObject({ total: 0, done: 0, duplicates: [] });
    q.add([file('b.jpg')]);
    expect(q.snapshot().total).toBe(1);
  });

  it('marks a restored duplicate', async () => {
    const q = new UploadQueue(async () => ({ kind: 'duplicate', itemId: 'T', trashed: true }));
    q.add([file('a.jpg')]);
    await tick();
    q.markRestored('T');
    expect(q.snapshot().duplicates).toEqual([{ name: 'a.jpg', itemId: 'T', trashed: false }]);
  });
});
