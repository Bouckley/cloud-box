import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ready } from '@cloudbox/crypto';
import { startBoxd, type RunningBox } from '@cloudbox/testbox';
import { Box, noMedia, type MediaAdapter, type SourceFile } from '../src/index.ts';
import { hookedOwner, PASSWORD, setUpOwner, type Hook } from './helpers.ts';

let box: RunningBox;
beforeAll(ready);
beforeEach(async () => {
  box = await startBoxd();
});
afterEach(async () => {
  await box?.stop();
});

const MiB = 1 << 20;

function random(n: number): Uint8Array {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i += 65536) crypto.getRandomValues(b.subarray(i, Math.min(n, i + 65536)));
  return b;
}

function file(name: string, bytes: Uint8Array, type = 'image/jpeg'): SourceFile {
  return {
    name,
    type,
    size: bytes.length,
    lastModified: Date.parse('2026-07-04T12:00:00Z'),
    slice: async (s, e) => bytes.slice(s, e),
  };
}

const isPartPut = (req: Request) =>
  req.method === 'PUT' && /^\/v1\/uploads\/[^/]+\/parts\/\d+$/.test(new URL(req.url).pathname);

describe('upload and download', () => {
  it('uploads a 9 MiB file and reads it back', async () => {
    const puts: string[] = [];
    const { p, me } = await hookedOwner(box, {
      fn: async (req) => {
        if (isPartPut(req)) puts.push(new URL(req.url).pathname.split('/').pop()!);
        return undefined;
      },
    });
    const bytes = random(9 * MiB);
    const progress: number[] = [];
    const r = await me.library.upload(file('big.jpg', bytes), me.library.roots().photos, noMedia, {
      onProgress: (sent, total) => {
        expect(total).toBeGreaterThan(bytes.length);
        progress.push(sent);
      },
    });
    expect(r.kind).toBe('uploaded');
    expect(puts).toEqual(['0', '1']); // 8 MiB parts
    expect(progress.at(-1)).toBeGreaterThan(bytes.length);

    const item = me.library.snapshot().items.get(r.itemId)!;
    expect(item.meta).toMatchObject({
      name: 'big.jpg',
      mime: 'image/jpeg',
      size: bytes.length,
      modifiedAt: '2026-07-04T12:00:00.000Z',
      takenAt: null,
      favourite: false,
      thumbMime: null,
      previewMime: null,
    });
    expect(await me.library.readBlob(item, 'original')).toEqual(bytes);

    // Another unlock reads it too.
    const again = await Box.connect(box.baseUrl, p).unlock(PASSWORD);
    const there = again.library.snapshot().items.get(r.itemId)!;
    expect(await again.library.readBlob(there, 'original')).toEqual(bytes);
  });

  it('state reaches replicated', async () => {
    const { me } = await setUpOwner(box);
    const r = await me.library.upload(
      file('a.jpg', random(1000)),
      me.library.roots().photos,
      noMedia,
    );
    expect(me.library.snapshot().items.get(r.itemId)?.state).not.toBe('replicated');
    await box.runJob('replicate');
    await me.library.sync();
    expect(me.library.snapshot().items.get(r.itemId)?.state).toBe('replicated');
  });

  it('duplicate is skipped', async () => {
    const { me } = await setUpOwner(box);
    const bytes = random(5000);
    const photos = me.library.roots().photos;
    const first = await me.library.upload(file('a.jpg', bytes), photos, noMedia);
    const second = await me.library.upload(file('copy of a.jpg', bytes), photos, noMedia);
    expect(second).toEqual({ kind: 'duplicate', itemId: first.itemId, trashed: false });
    expect(me.library.snapshot().items.size).toBe(1);
  });

  it('trashed duplicate offers restore', async () => {
    const { me } = await setUpOwner(box);
    const bytes = random(5000);
    const photos = me.library.roots().photos;
    const first = await me.library.upload(file('a.jpg', bytes), photos, noMedia);
    await me.library.trash([first.itemId]);
    const second = await me.library.upload(file('a.jpg', bytes), photos, noMedia);
    expect(second).toEqual({ kind: 'duplicate', itemId: first.itemId, trashed: true });
    expect(me.library.snapshot().items.size).toBe(1);
  });

  it('interrupted upload leaves no item', async () => {
    const { me } = await setUpOwner(box);
    const bytes = random(9 * MiB);
    const photos = me.library.roots().photos;
    const ac = new AbortController();
    const err = await me.library
      .upload(file('big.jpg', bytes), photos, noMedia, {
        signal: ac.signal,
        onProgress: () => ac.abort(),
      })
      .catch((e: unknown) => e);
    expect((err as Error).name).toBe('AbortError');
    await me.library.sync();
    expect(me.library.snapshot().items.size).toBe(0);

    const r = await me.library.upload(file('big.jpg', bytes), photos, noMedia);
    expect(r.kind).toBe('uploaded');
    expect(me.library.snapshot().items.size).toBe(1);
  });

  it('an already aborted signal sends nothing', async () => {
    const sent: string[] = [];
    const { me } = await hookedOwner(box, {
      fn: async (req) => {
        if (new URL(req.url).pathname.startsWith('/v1/uploads')) sent.push(req.url);
        return undefined;
      },
    });
    const ac = new AbortController();
    ac.abort();
    await expect(
      me.library.upload(file('a.jpg', random(10)), me.library.roots().photos, noMedia, {
        signal: ac.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(sent).toEqual([]);
  });

  it('retries a failed part', async () => {
    let failed = 0;
    const hook: { fn: Hook | null } = { fn: null };
    const { me } = await hookedOwner(box, hook);
    hook.fn = async (req) => {
      if (isPartPut(req) && new URL(req.url).pathname.endsWith('/parts/1') && failed === 0) {
        failed++;
        throw new TypeError('network down');
      }
      return undefined;
    };
    const delays: number[] = [];
    const bytes = random(9 * MiB);
    const r = await me.library.upload(file('big.jpg', bytes), me.library.roots().photos, noMedia, {
      sleep: async (ms) => {
        delays.push(ms);
      },
    });
    expect(failed).toBe(1);
    expect(delays).toEqual([1000]);
    const item = me.library.snapshot().items.get(r.itemId)!;
    expect(await me.library.readBlob(item, 'original')).toEqual(bytes);
  });

  it('gives up after three retries', async () => {
    const hook: { fn: Hook | null } = { fn: null };
    const { me } = await hookedOwner(box, hook);
    hook.fn = async (req) => (isPartPut(req) ? new Response('{}', { status: 503 }) : undefined);
    const delays: number[] = [];
    await expect(
      me.library.upload(file('a.jpg', random(100)), me.library.roots().photos, noMedia, {
        sleep: async (ms) => {
          delays.push(ms);
        },
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(delays).toEqual([1000, 4000, 10000]);
    expect(me.library.snapshot().items.size).toBe(0);
  });

  it('does not retry a refused part', async () => {
    const hook: { fn: Hook | null } = { fn: null };
    const { me } = await hookedOwner(box, hook);
    hook.fn = async (req) =>
      isPartPut(req)
        ? Response.json(
            { code: 'invalid_request', message: 'Bad part.', action: 'Try again.' },
            { status: 400 },
          )
        : undefined;
    const delays: number[] = [];
    await expect(
      me.library.upload(file('a.jpg', random(100)), me.library.roots().photos, noMedia, {
        sleep: async (ms) => {
          delays.push(ms);
        },
      }),
    ).rejects.toMatchObject({ status: 400, code: 'invalid_request' });
    expect(delays).toEqual([]);
  });

  it('thumb and preview stored and readable', async () => {
    const { me } = await setUpOwner(box);
    const thumb = random(2000);
    const preview = random(50_000);
    const media: MediaAdapter = {
      describe: async () => ({
        takenAt: new Date('2025-12-24T18:30:00Z'),
        width: 4032,
        height: 3024,
        durationMs: null,
        thumb: { bytes: thumb, mime: 'image/webp' },
        preview: { bytes: preview, mime: 'image/jpeg' },
      }),
    };
    const r = await me.library.upload(
      file('tree.heic', random(3000), 'image/heic'),
      me.library.roots().photos,
      media,
    );
    const item = me.library.snapshot().items.get(r.itemId)!;
    expect(item.meta).toMatchObject({
      takenAt: '2025-12-24T18:30:00.000Z',
      width: 4032,
      height: 3024,
      thumbMime: 'image/webp',
      previewMime: 'image/jpeg',
    });
    expect(Object.keys(item.blobs).sort()).toEqual(['original', 'preview', 'thumb']);
    expect(await me.library.readBlob(item, 'thumb')).toEqual(thumb);
    expect(await me.library.readBlob(item, 'preview')).toEqual(preview);
  });

  it('a media adapter that fails still uploads the original', async () => {
    const { me } = await setUpOwner(box);
    const media: MediaAdapter = {
      describe: async () => {
        throw new Error('cannot decode');
      },
    };
    const bytes = random(3000);
    const r = await me.library.upload(file('odd.jpg', bytes), me.library.roots().photos, media);
    const item = me.library.snapshot().items.get(r.itemId)!;
    expect(Object.keys(item.blobs)).toEqual(['original']);
    expect(item.meta?.thumbMime).toBeNull();
    expect(await me.library.readBlob(item, 'original')).toEqual(bytes);
  });

  it('a blob cannot be read as another role', async () => {
    const { me } = await setUpOwner(box);
    const media: MediaAdapter = {
      describe: async () => ({
        ...(await noMedia.describe(file('x', new Uint8Array()))),
        thumb: { bytes: random(100), mime: 'image/webp' },
      }),
    };
    const r = await me.library.upload(file('a.jpg', random(100)), me.library.roots().photos, media);
    const item = me.library.snapshot().items.get(r.itemId)!;
    const swapped = { ...item, blobs: { ...item.blobs, original: item.blobs.thumb! } };
    await expect(me.library.readBlob(swapped, 'original')).rejects.toThrow();
  });

  it('a stopped download is an AbortError, not an unreachable box', async () => {
    const { me } = await setUpOwner(box);
    const r = await me.library.upload(
      file('a.jpg', random(100)),
      me.library.roots().photos,
      noMedia,
    );
    const ac = new AbortController();
    ac.abort();
    const item = me.library.snapshot().items.get(r.itemId)!;
    await expect(me.library.readBlob(item, 'original', ac.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('lock during an upload sends no item', async () => {
    const sent: string[] = [];
    const hook: { fn: Hook | null } = { fn: null };
    const { me } = await hookedOwner(box, hook);
    hook.fn = async (req) => {
      const path = new URL(req.url).pathname;
      sent.push(`${req.method} ${path}`);
      if (isPartPut(req) && path.endsWith('/parts/0')) me.lock();
      return undefined;
    };
    await expect(
      me.library.upload(file('secret.jpg', random(9 * MiB)), me.library.roots().photos, noMedia),
    ).rejects.toMatchObject({ code: 'locked' });
    expect(sent.filter((s) => s === 'POST /v1/items')).toEqual([]);
    expect(sent.filter((s) => s.endsWith('/parts/1'))).toEqual([]);
  });

  it('dates outside years 0–9999 are stored as unknown', async () => {
    const { me } = await setUpOwner(box);
    const media: MediaAdapter = {
      describe: async () => ({
        takenAt: new Date(Date.UTC(-1, 0, 1)),
        width: 1.5,
        height: -3,
        durationMs: null,
      }),
    };
    const f = { ...file('odd.jpg', random(10)), lastModified: Date.UTC(10000, 0, 1) };
    const r = await me.library.upload(f, me.library.roots().photos, media);
    const item = me.library.snapshot().items.get(r.itemId)!;
    expect(item.meta).toMatchObject({ modifiedAt: null, takenAt: null, width: null, height: null });
  });

  it('a full box is not retried', async () => {
    const hook: { fn: Hook | null } = { fn: null };
    const { me } = await hookedOwner(box, hook);
    hook.fn = async (req) =>
      isPartPut(req)
        ? Response.json(
            { code: 'storage_full', message: 'Full.', action: 'Free up space.' },
            { status: 507 },
          )
        : undefined;
    const delays: number[] = [];
    await expect(
      me.library.upload(file('a.jpg', random(100)), me.library.roots().photos, noMedia, {
        sleep: async (ms) => {
          delays.push(ms);
        },
      }),
    ).rejects.toMatchObject({ status: 507, code: 'storage_full' });
    expect(delays).toEqual([]);
  });

  it('streams a download in chunks', async () => {
    const { me } = await setUpOwner(box);
    const bytes = random(9 * MiB + 7);
    const r = await me.library.upload(
      file('big.bin', bytes, 'application/octet-stream'),
      me.library.roots().files,
      noMedia,
    );
    const item = me.library.snapshot().items.get(r.itemId)!;
    const parts: Uint8Array[] = [];
    const reader = me.library.readBlobStream(item, 'original').getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
    }
    expect(parts.length).toBe(3); // 4 MiB + 4 MiB + 1 MiB
    expect(Buffer.compare(Buffer.concat(parts), Buffer.from(bytes))).toBe(0);
  });

  it('a streamed download of the wrong role fails', async () => {
    const { me } = await setUpOwner(box);
    const media: MediaAdapter = {
      describe: async () => ({
        takenAt: null,
        width: null,
        height: null,
        durationMs: null,
        thumb: { bytes: random(100), mime: 'image/webp' },
      }),
    };
    const r = await me.library.upload(file('a.jpg', random(100)), me.library.roots().photos, media);
    const item = me.library.snapshot().items.get(r.itemId)!;
    const swapped = { ...item, blobs: { ...item.blobs, original: item.blobs.thumb! } };
    const reader = me.library.readBlobStream(swapped, 'original').getReader();
    await expect(
      (async () => {
        for (;;) if ((await reader.read()).done) return;
      })(),
    ).rejects.toThrow();
  });

  it('empty file uploads', async () => {
    const { me } = await setUpOwner(box);
    const r = await me.library.upload(
      file('empty.txt', new Uint8Array(), 'text/plain'),
      me.library.roots().files,
      noMedia,
    );
    expect(r.kind).toBe('uploaded');
    const item = me.library.snapshot().items.get(r.itemId)!;
    expect(item.meta?.size).toBe(0);
    expect(await me.library.readBlob(item, 'original')).toEqual(new Uint8Array());
  });

  it('a file with no type is application/octet-stream', async () => {
    const { me } = await setUpOwner(box);
    const r = await me.library.upload(
      file('notes', random(10), ''),
      me.library.roots().files,
      noMedia,
    );
    expect(me.library.snapshot().items.get(r.itemId)?.meta?.mime).toBe('application/octet-stream');
  });

  it('zero knowledge', async () => {
    const { me } = await setUpOwner(box);
    const MARKER = 'CLOUDBOX-PLAINTEXT-MARKER';
    const bytes = random(9 * MiB);
    const marker = new TextEncoder().encode(MARKER);
    for (const at of [0, 4 * MiB, 8 * MiB + 5, bytes.length - marker.length]) bytes.set(marker, at);
    const thumb = new TextEncoder().encode(`${MARKER}-thumb`);
    const media: MediaAdapter = {
      describe: async () => ({
        takenAt: null,
        width: null,
        height: null,
        durationMs: null,
        thumb: { bytes: thumb, mime: 'image/webp' },
      }),
    };
    await me.library.upload(file('IMG_MARKER.jpg', bytes), me.library.roots().photos, media);
    await box.runJob('replicate');

    const files = await allFiles(box.dataDir);
    expect(files.filter((f) => f.includes(join('blobs', ''))).length).toBeGreaterThanOrEqual(4);
    let scanned = 0;
    for (const f of files) {
      const data = await readFile(f);
      scanned += data.length;
      for (const s of [MARKER, 'IMG_MARKER']) {
        expect(data.includes(Buffer.from(s)), `${s} found in ${f}`).toBe(false);
      }
    }
    expect(scanned).toBeGreaterThan(2 * bytes.length);
    for (const s of [MARKER, 'IMG_MARKER']) expect(box.logs()).not.toContain(s);
  });
});

async function allFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await allFiles(p)));
    else if (e.isFile()) out.push(p);
  }
  return out;
}
