import type { ItemView, LibrarySnapshot } from '@cloudbox/core';
import { describe, expect, it } from 'vitest';
import { coll, photo } from '../test/photos.ts';
import {
  allFolders,
  entryName,
  folderEntries,
  folderPath,
  isEmptyFolder,
  opensInTab,
  searchEntries,
  sortEntries,
  type FileEntry,
} from './files.ts';

const file = (id: string, collectionId: string, name: string, size: number, modifiedAt: string) =>
  photo(id, null, { collectionId }, { name, size, modifiedAt, mime: 'application/pdf' });

/** Files › Taxes › 2025, Files › Car, and a few papers. */
const library = (): LibrarySnapshot => ({
  collections: new Map([
    ['files', coll('files', 'folder', { name: 'Files', role: 'files' })],
    ['photos', coll('photos', 'album', { name: 'Photos', role: 'photos' })],
    ['taxes', coll('taxes', 'folder', { name: 'Taxes', parentId: 'files' })],
    ['y2025', coll('y2025', 'folder', { name: '2025', parentId: 'taxes' })],
    ['car', coll('car', 'folder', { name: 'car', parentId: 'files' })],
    ['old', coll('old', 'folder', { name: 'Old', parentId: 'files', deletedAt: new Date() })],
    ['secret', coll('secret', 'folder', { name: null, parentId: 'files' })],
  ]),
  items: new Map(
    [
      file('a', 'files', 'Will.pdf', 650_000, '2026-09-21T10:00:00Z'),
      file('b', 'files', 'insurance 10.pdf', 1_400_000, '2026-11-02T10:00:00Z'),
      file('c', 'files', 'insurance 9.pdf', 2_100_000, '2026-10-12T10:00:00Z'),
      file('t', 'files', 'Gone.pdf', 10, '2026-01-01T10:00:00Z'),
      file('r', 'taxes', 'Return 2025.pdf', 3_800_000, '2026-10-28T10:00:00Z'),
      file('s', 'y2025', 'Receipts insurance.pdf', 48_000, '2026-10-03T10:00:00Z'),
      photo('p', null, { collectionId: 'photos' }, { name: 'insurance card.jpg' }),
    ].map((i) => [i.id, i.id === 't' ? { ...i, trashedAt: new Date() } : i]),
  ),
  syncedAt: new Date(),
});

const names = (es: FileEntry[]) => es.map(entryName);

describe('folderEntries', () => {
  it('lists the folders and files directly in it, not deleted or trashed ones', () => {
    const got = names(folderEntries(library(), 'files'));
    expect(got).toHaveLength(6);
    expect(got).toEqual(
      expect.arrayContaining([
        null,
        'car',
        'insurance 10.pdf',
        'insurance 9.pdf',
        'Taxes',
        'Will.pdf',
      ]),
    );
  });

  it('counts every file inside a folder, however deep', () => {
    const taxes = folderEntries(library(), 'files').find((e) => entryName(e) === 'Taxes');
    expect(taxes).toMatchObject({ kind: 'folder', files: 2, folders: 1 });
  });
});

describe('sortEntries', () => {
  const all = () => folderEntries(library(), 'files');

  it('by name: folders first, then files, in natural order; unreadable names last', () => {
    expect(names(sortEntries(all(), 'name'))).toEqual([
      'car',
      'Taxes',
      null,
      'insurance 9.pdf',
      'insurance 10.pdf',
      'Will.pdf',
    ]);
  });

  it('by modified: folders first by name, then newest files first', () => {
    expect(names(sortEntries(all(), 'modified')).slice(3)).toEqual([
      'insurance 10.pdf',
      'insurance 9.pdf',
      'Will.pdf',
    ]);
  });

  it('by size: folders first by name, then largest files first', () => {
    expect(names(sortEntries(all(), 'size')).slice(3)).toEqual([
      'insurance 9.pdf',
      'insurance 10.pdf',
      'Will.pdf',
    ]);
  });
});

describe('searchEntries', () => {
  it('finds names in this folder and every folder inside it, ignoring case, never photos', () => {
    const found = searchEntries(library(), 'files', 'INSURANCE');
    expect(found.map((f) => [entryName(f.entry), f.folderId]).sort()).toEqual([
      ['Receipts insurance.pdf', 'y2025'],
      ['insurance 10.pdf', 'files'],
      ['insurance 9.pdf', 'files'],
    ]);
  });

  it('finds folders by name too, and only below where you are', () => {
    expect(searchEntries(library(), 'taxes', '20').map((f) => entryName(f.entry))).toEqual([
      '2025',
      'Return 2025.pdf',
    ]);
  });

  it('a blank search finds nothing', () => {
    expect(searchEntries(library(), 'files', '   ')).toEqual([]);
  });
});

describe('folderPath', () => {
  it('runs from Files down to the folder', () => {
    expect(folderPath(library(), 'y2025').map((c) => c.name)).toEqual(['Files', 'Taxes', '2025']);
    expect(folderPath(library(), 'files').map((c) => c.name)).toEqual(['Files']);
  });

  it('is empty for a folder that is not there', () => {
    expect(folderPath(library(), 'nope')).toEqual([]);
    expect(folderPath(library(), 'old')).toEqual([]);
  });
});

describe('isEmptyFolder', () => {
  it('only with no files and no folders in it (Trash does not count)', () => {
    expect(isEmptyFolder(library(), 'y2025')).toBe(false);
    expect(isEmptyFolder(library(), 'taxes')).toBe(false);
    expect(isEmptyFolder(library(), 'car')).toBe(true);
    const lib = library();
    (lib.items as Map<string, ItemView>).set('t2', {
      ...file('t2', 'car', 'x.pdf', 1, '2026-01-01T00:00:00Z'),
      trashedAt: new Date(),
    });
    expect(isEmptyFolder(lib, 'car')).toBe(true);
  });
});

describe('opensInTab', () => {
  it('photos and PDFs the browser can show open; everything else downloads', () => {
    for (const m of ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp']) {
      expect(opensInTab(m)).toBe(true);
    }
    for (const m of ['image/heic', 'image/svg+xml', 'text/html', 'application/zip', '']) {
      expect(opensInTab(m)).toBe(false);
    }
  });
});

describe('allFolders', () => {
  it('every folder, Files first, each with the folder it is in; unreadable ones left out', () => {
    expect(allFolders(library()).map((f) => [f.folder.id, f.where])).toEqual([
      ['files', null],
      ['car', 'Files'],
      ['taxes', 'Files'],
      ['y2025', 'Files › Taxes'],
    ]);
  });
});
