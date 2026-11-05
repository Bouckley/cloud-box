import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ready } from '@cloudbox/crypto';
import { startBoxd, type RunningBox } from '@cloudbox/testbox';
import { Box, BoxError, noMedia, type Unlocked } from '../src/index.ts';
import { nodePlatform } from '../src/testing.ts';
import { createItem, hookedOwner, meta, PASSWORD, setUpOwner, type Hook } from './helpers.ts';

let box: RunningBox;
beforeAll(ready);
beforeEach(async () => {
  box = await startBoxd();
});
afterEach(async () => {
  await box?.stop();
});

const roleCount = (me: Unlocked, role: 'photos' | 'files') =>
  [...me.library.snapshot().collections.values()].filter((c) => c.role === role && !c.deletedAt)
    .length;

describe('library', () => {
  it('syncs every page', async () => {
    const { p, me } = await setUpOwner(box);
    const { photos } = me.library.roots();
    const ids: string[] = [];
    for (let i = 0; i < 1200; i += 25) {
      const batch = Array.from({ length: 25 }, (_, j) =>
        createItem(me, photos, meta(`IMG_${i + j}.jpg`)),
      );
      ids.push(...(await Promise.all(batch)));
    }

    // A fresh unlock on another connection counts its item requests.
    let itemPages = 0;
    const counting = nodePlatform(((input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      const u = new URL(req.url);
      if (req.method === 'GET' && u.pathname === '/v1/items') itemPages++;
      return box.fetch(req);
    }) as typeof fetch);
    counting.store = p.store;
    const again = await Box.connect(box.baseUrl, counting).unlock(PASSWORD);
    const snap = again.library.snapshot();
    expect(snap.items.size).toBe(1200);
    for (const id of ids) expect(snap.items.get(id)?.meta?.name).toMatch(/^IMG_\d+\.jpg$/);
    expect(itemPages).toBeGreaterThanOrEqual(3);
    expect(snap.syncedAt).toBeInstanceOf(Date);

    // A second sync asks once and changes nothing.
    itemPages = 0;
    await again.library.sync();
    expect(itemPages).toBe(1);
    expect(again.library.snapshot().items).toBe(snap.items);
  });

  it('roots created once', async () => {
    const { p, me } = await setUpOwner(box);
    expect(roleCount(me, 'photos')).toBe(1);
    expect(roleCount(me, 'files')).toBe(1);
    const roots = me.library.roots();
    const again = await Box.connect(box.baseUrl, p).unlock(PASSWORD);
    expect(roleCount(again, 'photos')).toBe(1);
    expect(roleCount(again, 'files')).toBe(1);
    expect(again.library.roots()).toEqual(roots);
    const photos = again.library.snapshot().collections.get(roots.photos)!;
    expect(photos.kind).toBe('album');
    expect(photos.name).toBe('Photos');
    expect(again.library.snapshot().collections.get(roots.files)!.kind).toBe('folder');
  });

  it('subscribe hears changes and gets a new snapshot', async () => {
    const { me } = await setUpOwner(box);
    let calls = 0;
    const before = me.library.snapshot();
    const off = me.library.subscribe(() => calls++);
    const id = await me.library.createCollection('album', 'Summer');
    expect(calls).toBeGreaterThan(0);
    expect(me.library.snapshot()).not.toBe(before);
    expect(me.library.snapshot().collections.get(id)?.name).toBe('Summer');
    off();
    const n = calls;
    await me.library.renameCollection(id, 'Summer 2026');
    expect(calls).toBe(n);
    expect(me.library.snapshot().collections.get(id)?.name).toBe('Summer 2026');
  });

  it('folders default to the files root', async () => {
    const { me } = await setUpOwner(box);
    const id = await me.library.createCollection('folder', 'Taxes');
    expect(me.library.snapshot().collections.get(id)?.parentId).toBe(me.library.roots().files);
    const child = await me.library.createCollection('folder', '2026', id);
    expect(me.library.snapshot().collections.get(child)?.parentId).toBe(id);
  });

  it('move re-wraps the file key', async () => {
    const { p, me } = await setUpOwner(box);
    const plaintext = new Uint8Array([1, 2, 3]);
    const id = await createItem(me, me.library.roots().photos, meta('beach.jpg'), plaintext);
    const album = await me.library.createCollection('album', 'Summer');
    await me.library.sync();
    await me.library.move([id], album);
    expect(me.library.snapshot().items.get(id)?.collectionId).toBe(album);

    const again = await Box.connect(box.baseUrl, p).unlock(PASSWORD);
    const item = again.library.snapshot().items.get(id)!;
    expect(item.collectionId).toBe(album);
    expect(item.meta?.name).toBe('beach.jpg');
    expect(await again.library.readBlob(item, 'original')).toEqual(plaintext);
  });

  it('trash, restore, delete forever', async () => {
    const { me } = await setUpOwner(box);
    const lib = me.library;
    const id = await createItem(me, lib.roots().photos, meta('a.jpg'));
    await lib.sync();
    await lib.trash([id]);
    expect(lib.snapshot().items.get(id)?.trashedAt).toBeInstanceOf(Date);
    const trash = await lib.trashList();
    expect(trash.map((t) => t.item.id)).toEqual([id]);
    expect(trash[0]!.daysLeft).toBe(30);

    await lib.restore([id]);
    expect(lib.snapshot().items.get(id)?.trashedAt).toBeNull();
    expect(await lib.trashList()).toEqual([]);

    await lib.trash([id]);
    await lib.deleteForever([id]);
    expect(lib.snapshot().items.has(id)).toBe(false);
    expect(await lib.trashList()).toEqual([]);
  });

  it('delete forever refuses items not in Trash', async () => {
    const { me } = await setUpOwner(box);
    const id = await createItem(me, me.library.roots().photos, meta('a.jpg'));
    await me.library.sync();
    await expect(me.library.deleteForever([id])).rejects.toMatchObject({ code: 'not_in_trash' });
    expect(me.library.snapshot().items.has(id)).toBe(true);
  });

  it('delete album keeps photos', async () => {
    const { me } = await setUpOwner(box);
    const lib = me.library;
    const album = await lib.createCollection('album', 'Summer');
    const a = await createItem(me, album, meta('a.jpg'));
    const b = await createItem(me, album, meta('b.jpg'));
    await lib.sync();
    await lib.deleteCollection(album, 'keep');
    const snap = lib.snapshot();
    expect(snap.items.get(a)?.collectionId).toBe(lib.roots().photos);
    expect(snap.items.get(b)?.collectionId).toBe(lib.roots().photos);
    expect(snap.items.get(a)?.trashedAt).toBeNull();
    expect(snap.collections.get(album)?.deletedAt).toBeInstanceOf(Date);
  });

  it('delete folder keeps files in its parent', async () => {
    const { me } = await setUpOwner(box);
    const lib = me.library;
    const parent = await lib.createCollection('folder', 'Work');
    const child = await lib.createCollection('folder', 'Old', parent);
    const f = await createItem(me, child, meta('notes.pdf', { mime: 'application/pdf' }));
    await lib.sync();
    await lib.deleteCollection(child, 'keep');
    expect(lib.snapshot().items.get(f)?.collectionId).toBe(parent);
    expect(lib.snapshot().collections.get(child)?.deletedAt).toBeInstanceOf(Date);
  });

  it('delete album with trash', async () => {
    const { me } = await setUpOwner(box);
    const lib = me.library;
    const album = await lib.createCollection('album', 'Party');
    const a = await createItem(me, album, meta('a.jpg'));
    await lib.sync();
    await lib.deleteCollection(album, 'trash');
    expect(lib.snapshot().items.get(a)?.trashedAt).toBeInstanceOf(Date);
    expect(lib.snapshot().collections.get(album)?.deletedAt).toBeInstanceOf(Date);
    // A trashed item still decrypts with its deleted album's key.
    expect(lib.snapshot().items.get(a)?.meta?.name).toBe('a.jpg');

    await lib.restore([a]);
    expect(lib.snapshot().collections.get(album)?.deletedAt).toBeNull();
    expect(lib.snapshot().items.get(a)?.collectionId).toBe(album);
  });

  it('roots cannot be deleted', async () => {
    const { me } = await setUpOwner(box);
    await expect(me.library.deleteCollection(me.library.roots().photos, 'keep')).rejects.toThrow();
    expect(roleCount(me, 'photos')).toBe(1);
  });

  it('favourite persists across a fresh unlock', async () => {
    const { p, me } = await setUpOwner(box);
    const id = await createItem(me, me.library.roots().photos, meta('cat.jpg'));
    await me.library.sync();
    await me.library.setFavourite(id, true);
    expect(me.library.snapshot().items.get(id)?.meta?.favourite).toBe(true);
    const again = await Box.connect(box.baseUrl, p).unlock(PASSWORD);
    const item = again.library.snapshot().items.get(id)!;
    expect(item.meta?.favourite).toBe(true);
    expect(item.meta?.name).toBe('cat.jpg');
  });

  it('unreadable metadata shows as null, not a crash', async () => {
    const { me } = await setUpOwner(box);
    // An item whose metadata is valid JSON of the wrong shape.
    const id = await createItem(me, me.library.roots().photos, {
      ...meta('x.jpg'),
      v: 2,
    } as unknown as ReturnType<typeof meta>);
    await me.library.sync();
    const item = me.library.snapshot().items.get(id)!;
    expect(item.meta).toBeNull();
    expect(item.collectionId).toBe(me.library.roots().photos);
  });

  it('ids the box does not know are 404 → BoxError', async () => {
    // A box has one user, so the ids come from a second box. User scoping
    // itself is covered by the Go tests.
    const { me } = await setUpOwner(box);
    const mine = await createItem(me, me.library.roots().photos, meta('a.jpg'));
    const otherBox = await startBoxd();
    try {
      const { me: other } = await setUpOwner(otherBox);
      const theirs = other.library.roots().photos;
      const err = await me.library.trash([theirs]).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BoxError);
      expect((err as BoxError).status).toBe(404);
      await expect(other.library.trash([mine])).rejects.toMatchObject({ status: 404 });
      await expect(other.library.restore([mine])).rejects.toMatchObject({ status: 404 });
      await expect(other.library.deleteForever([mine])).rejects.toMatchObject({ status: 404 });
      await expect(
        other.library.renameCollection(me.library.roots().photos, 'x'),
      ).rejects.toThrow();
    } finally {
      await otherBox.stop();
    }
  });

  it('lock wipes collection keys', async () => {
    const { me } = await setUpOwner(box);
    const col = me.library.snapshot().collections.get(me.library.roots().photos)!;
    me.lock();
    expect(col.key!.every((b) => b === 0)).toBe(true);
    await expect(me.library.sync()).rejects.toThrow();
  });

  // Final review I2: a sync that re-reads an item while its blob downloads
  // used to zero the very key the download was about to decrypt with.
  it('a sync during a download does not break it', async () => {
    const hook: { fn: Hook | null } = { fn: null };
    const { me } = await hookedOwner(box, hook);
    const plaintext = new Uint8Array([9, 8, 7, 6]);
    const id = await createItem(me, me.library.roots().photos, meta('a.jpg'), plaintext);
    await me.library.sync();
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let holding!: () => void;
    const isHeld = new Promise<void>((r) => (holding = r));
    hook.fn = async (req) => {
      if (!new URL(req.url).pathname.startsWith('/v1/blobs/')) return undefined;
      holding();
      await held;
      return undefined;
    };
    const reading = me.library.readBlob(me.library.snapshot().items.get(id)!, 'original');
    await isHeld;
    // The item changes on the box (copied to the backup) and a sync picks it up.
    await box.runJob('replicate');
    await me.library.sync();
    expect(me.library.snapshot().items.get(id)?.state).toBe('replicated');
    release();
    expect(await reading).toEqual(plaintext);
  });

  it('a sync that fails part-way loses nothing', async () => {
    const hook: { fn: Hook | null } = { fn: null };
    const { me } = await hookedOwner(box, hook);
    const photos = me.library.roots().photos;
    const ids = [
      await createItem(me, photos, meta('a.jpg')),
      await createItem(me, photos, meta('b.jpg')),
      await createItem(me, photos, meta('c.jpg')),
    ];
    // Page 1 says there is more; fetching page 2 fails.
    let pages = 0;
    hook.fn = async (req) => {
      const u = new URL(req.url);
      if (req.method !== 'GET' || u.pathname !== '/v1/items') return undefined;
      pages++;
      if (pages === 1) {
        const body = (await (await box.fetch(req)).json()) as { more: boolean };
        return Response.json({ ...body, more: true });
      }
      throw new TypeError('network down');
    };
    await expect(me.library.sync()).rejects.toMatchObject({ code: 'box_unreachable' });
    hook.fn = null;
    await me.library.sync();
    const snap = me.library.snapshot();
    for (const id of ids) expect(snap.items.get(id)?.meta).not.toBeNull();
    expect(snap.items.size).toBe(3);
  });

  it('an unreadable collection cannot be written to', async () => {
    const hook: { fn: Hook | null } = { fn: null };
    const { p, me } = await hookedOwner(box, hook);
    const broken = await me.library.createCollection('album', 'Broken');
    const item = await createItem(me, me.library.roots().photos, meta('a.jpg'));
    // The box serves a key for "Broken" that does not unwrap.
    const writes: string[] = [];
    hook.fn = async (req) => {
      const u = new URL(req.url);
      if (req.method !== 'GET') writes.push(`${req.method} ${u.pathname}`);
      if (req.method !== 'GET' || u.pathname !== '/v1/collections') return undefined;
      const body = (await (await box.fetch(req)).json()) as {
        collections: { id: string; keyEnc: string }[];
      };
      for (const c of body.collections) {
        if (c.id === broken) {
          c.keyEnc = Buffer.from(crypto.getRandomValues(new Uint8Array(72))).toString('base64');
        }
      }
      return Response.json(body);
    };
    const again = await Box.connect(box.baseUrl, p).unlock(PASSWORD);
    const view = again.library.snapshot().collections.get(broken)!;
    expect(view.key).toBeNull();
    expect(view.name).toBeNull();
    writes.length = 0;
    const src = {
      name: 'x.jpg',
      type: 'image/jpeg',
      size: 3,
      lastModified: 0,
      slice: async () => new Uint8Array(3),
    };
    await expect(again.library.upload(src, broken, noMedia)).rejects.toThrow();
    await expect(again.library.move([item], broken)).rejects.toThrow();
    await expect(again.library.renameCollection(broken, 'Fixed')).rejects.toThrow();
    expect(writes.filter((w) => !w.startsWith('POST /v1/auth/'))).toEqual([]);
  });
});
