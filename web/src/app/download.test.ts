import type { Library } from '@cloudbox/core';
import { describe, expect, it, vi } from 'vitest';
import { photo } from '../test/photos.ts';
import { DownloadTooBig, MAX_IN_MEMORY, saveOriginal } from './download.ts';

const big = photo('v', null, { blobs: { original: { id: 'o', size: MAX_IN_MEMORY + 1 } } });

describe('saveOriginal', () => {
  it('streams to the chosen file where the browser allows it, never into memory', async () => {
    const written: number[] = [];
    const out = new WritableStream<Uint8Array>({ write: (c) => void written.push(c.length) });
    const library = {
      readBlobStream: vi.fn(
        () => new ReadableStream({ start: (c) => (c.enqueue(new Uint8Array(3)), c.close()) }),
      ),
      readBlob: vi.fn(),
    } as unknown as Library;
    const picker = vi.fn(async () => ({ createWritable: async () => out }));
    await saveOriginal(library, big, { showSaveFilePicker: picker, document });
    expect(picker).toHaveBeenCalledWith({ suggestedName: 'v.jpg' });
    expect(written).toEqual([3]);
    expect(library.readBlob).not.toHaveBeenCalled();
  });

  it('cancelling the save dialog is not an error', async () => {
    const library = { readBlobStream: vi.fn() } as unknown as Library;
    const picker = vi.fn(async () => {
      throw new DOMException('no', 'AbortError');
    });
    await expect(
      saveOriginal(library, big, { showSaveFilePicker: picker, document }),
    ).resolves.toBeUndefined();
    expect(library.readBlobStream).not.toHaveBeenCalled();
  });

  it('without a file picker, refuses files over 2 GiB rather than filling memory', async () => {
    const library = { readBlob: vi.fn() } as unknown as Library;
    await expect(saveOriginal(library, big, { document })).rejects.toBeInstanceOf(DownloadTooBig);
    expect(library.readBlob).not.toHaveBeenCalled();
  });
});
