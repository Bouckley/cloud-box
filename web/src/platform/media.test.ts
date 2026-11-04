import { describe, expect, it } from 'vitest';
import { fileSource, webMedia } from './media.ts';

const NULLS = { takenAt: null, width: null, height: null, durationMs: null };

describe('webMedia', () => {
  it('a non-image gives all nulls', async () => {
    const f = new File(['just some text'], 'notes.txt', { type: 'text/plain' });
    const info = await webMedia.describe(fileSource(f));
    expect(info).toEqual(NULLS);
  });

  it('a broken image gives all nulls, not a throw', async () => {
    const f = new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00, 1, 2, 3])], 'broken.jpg', {
      type: 'image/jpeg',
    });
    const info = await webMedia.describe(fileSource(f));
    expect(info).toMatchObject(NULLS);
    expect(info.thumb).toBeUndefined();
    expect(info.preview).toBeUndefined();
  });
});

describe('fileSource', () => {
  it('slices the file as bytes', async () => {
    const f = new File([new Uint8Array([1, 2, 3, 4, 5])], 'a.bin', {
      type: 'application/octet-stream',
      lastModified: 1000,
    });
    const s = fileSource(f);
    expect(s).toMatchObject({ name: 'a.bin', size: 5, lastModified: 1000 });
    expect(await s.slice(1, 4)).toEqual(new Uint8Array([2, 3, 4]));
  });
});
