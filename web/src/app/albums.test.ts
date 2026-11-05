import type { Library, LibrarySnapshot } from '@cloudbox/core';
import { describe, expect, it, vi } from 'vitest';
import { coll, photo } from '../test/photos.ts';
import {
  albumAdder,
  albumList,
  countText,
  parseScope,
  pickerChoices,
  scopeHome,
  scopeItems,
  scopeParam,
  videoCountText,
  type Scope,
} from './albums.ts';

const library = (): LibrarySnapshot => ({
  collections: new Map([
    ['root', coll('root', 'album', { name: 'Photos', role: 'photos' })],
    ['garden', coll('garden', 'album', { name: 'Garden' })],
    ['family', coll('family', 'album', { name: 'Family' })],
    ['empty', coll('empty', 'album', { name: 'empty one' })],
    ['gone', coll('gone', 'album', { name: 'Gone', deletedAt: new Date() })],
    ['secret', coll('secret', 'album', { name: null })],
    ['locked', coll('locked', 'album', { name: null, key: null })],
    ['files', coll('files', 'folder', { name: 'Files', role: 'files' })],
  ]),
  items: new Map(
    [
      photo('r1', '2026-10-01T10:00:00Z', { collectionId: 'root' }),
      photo('g1', '2026-10-02T10:00:00Z', { collectionId: 'garden' }),
      photo('g2', '2026-10-05T10:00:00Z', { collectionId: 'garden' }, { favourite: true }),
      photo('g3', '2026-10-09T10:00:00Z', {
        collectionId: 'garden',
        trashedAt: new Date('2026-10-10T00:00:00Z'),
      }),
      photo('f1', '2026-09-01T10:00:00Z', { collectionId: 'family' }, { mime: 'video/mp4' }),
      photo('d1', '2026-09-02T10:00:00Z', { collectionId: 'files' }, { favourite: true }),
      photo('l1', '2026-09-03T10:00:00Z', { collectionId: 'locked' }),
    ].map((i) => [i.id, i]),
  ),
  syncedAt: new Date(),
});

describe('albumList', () => {
  it('lists the user’s albums by name, not Photos, deleted ones or folders', () => {
    const names = albumList(library()).map((a) => a.album.name);
    expect(names).toEqual(['empty one', 'Family', 'Garden', null, null]);
  });

  it('counts photos outside Trash, and covers with the newest', () => {
    const garden = albumList(library()).find((a) => a.album.id === 'garden')!;
    expect(garden.count).toBe(2);
    expect(garden.cover?.id).toBe('g2');
    const empty = albumList(library()).find((a) => a.album.id === 'empty')!;
    expect(empty.count).toBe(0);
    expect(empty.cover).toBeNull();
  });
});

describe('countText', () => {
  it('says photos, with one for 1', () => {
    expect(countText(0)).toBe('0 photos');
    expect(countText(1)).toBe('1 photo');
    expect(countText(1286)).toBe(`${(1286).toLocaleString()} photos`);
  });
});

describe('scopes', () => {
  it('an album holds its own photos, newest first', () => {
    const ids = scopeItems(library(), { kind: 'album', id: 'garden' }).map((i) => i.id);
    expect(ids).toEqual(['g2', 'g1']);
  });

  it('Favourites and Videos come from every album, never from Files', () => {
    expect(scopeItems(library(), { kind: 'favourites' }).map((i) => i.id)).toEqual(['g2']);
    expect(scopeItems(library(), { kind: 'videos' }).map((i) => i.id)).toEqual(['f1']);
    expect(scopeItems(library(), { kind: 'all' }).map((i) => i.id)).toEqual([
      'g2',
      'g1',
      'r1',
      'l1',
      'f1',
    ]);
  });

  it('round-trips through the viewer’s address, and knows its way back', () => {
    const scopes: Scope[] = [
      { kind: 'all' },
      { kind: 'album', id: 'garden' },
      { kind: 'favourites' },
      { kind: 'videos' },
    ];
    for (const s of scopes) expect(parseScope(scopeParam(s))).toEqual(s);
    expect(scopeParam({ kind: 'all' })).toBeNull();
    expect(parseScope('nonsense')).toEqual({ kind: 'all' });
    expect(scopes.map(scopeHome)).toEqual([
      '/photos',
      '/albums/garden',
      '/albums/favourites',
      '/albums/videos',
    ]);
  });
});

describe('pickerChoices', () => {
  const homes = (c: ReturnType<typeof pickerChoices>) =>
    c.homes.map((h) => [h.entry.album.id, h.count]);

  it('reports which albums the photos are in, most first', () => {
    const c = pickerChoices(library(), ['f1', 'g1', 'g2', 'r1']);
    expect(homes(c)).toEqual([
      ['garden', 2],
      ['family', 1],
    ]);
    expect(c.onlyInPhotos).toBe(1);
    expect(c.albums.map((a) => a.album.id)).toEqual(['empty', 'family', 'garden', 'secret']);
  });

  it('all in one album: that album is not offered', () => {
    const c = pickerChoices(library(), ['g1', 'g2']);
    expect(c.albums.map((a) => a.album.id)).toEqual(['empty', 'family', 'secret']);
    expect(homes(c)).toEqual([['garden', 2]]);
    expect(c.onlyInPhotos).toBe(0);
  });

  it('all in the album being shown: it stays in the list, in its place, to show where they are', () => {
    const c = pickerChoices(library(), ['g1', 'g2'], 'garden');
    expect(c.albums.map((a) => a.album.id)).toEqual(['empty', 'family', 'garden', 'secret']);
    expect(homes(c)).toEqual([['garden', 2]]);
  });

  it('a photo in an album whose key cannot be read cannot move, and is said apart', () => {
    const c = pickerChoices(library(), ['g1', 'l1']);
    expect(homes(c)).toEqual([['garden', 1]]);
    expect(c.unmovable).toBe(1);
    expect(c.albums.map((a) => a.album.id)).not.toContain('locked');
  });

  it('photos in a folder are neither leaving an album nor in Photos', () => {
    const c = pickerChoices(library(), ['d1']);
    expect(c.homes).toEqual([]);
    expect(c.onlyInPhotos).toBe(0);
  });
});

describe('videoCountText', () => {
  it('says videos, with one for 1', () => {
    expect(videoCountText(0)).toBe('0 videos');
    expect(videoCountText(1)).toBe('1 video');
    expect(videoCountText(1200)).toBe('1,200 videos');
  });
});

describe('albumAdder', () => {
  /** A library whose first move fails, like a box that drops off mid-move. */
  function flaky() {
    const snapshot = library();
    let made = 0;
    const lib = {
      snapshot: () => snapshot,
      createCollection: vi.fn(() => Promise.resolve(`new${++made}`)),
      move: vi
        .fn<(ids: string[], to: string) => Promise<void>>()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue(undefined),
    };
    return lib;
  }

  it('a retry after the album was made reuses it, not a second one', async () => {
    const lib = flaky();
    const add = albumAdder(lib as unknown as Library);
    await expect(add(['g1'], { newName: 'Trips' })).rejects.toThrow('offline');
    expect(await add(['g1'], { newName: 'Trips' })).toEqual({ id: 'new1', name: 'Trips' });
    expect(lib.createCollection).toHaveBeenCalledTimes(1);
    expect(lib.move).toHaveBeenLastCalledWith(['g1'], 'new1');
  });

  it('leaves out photos whose album cannot be read, so the rest move', async () => {
    const lib = flaky();
    lib.move.mockReset().mockResolvedValue(undefined);
    await albumAdder(lib as unknown as Library)(['l1', 'g1', 'r1'], {
      id: 'family',
      name: 'Family',
    });
    expect(lib.move).toHaveBeenCalledWith(['g1', 'r1'], 'family');
  });
});
