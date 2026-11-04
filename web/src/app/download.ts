import type { ItemView, Library } from '@cloudbox/core';

/** Above this, the file is never held in memory (scope ruling S7). */
export const MAX_IN_MEMORY = 2 * 2 ** 30;

type SavePicker = (o: { suggestedName: string }) => Promise<{
  createWritable(): Promise<WritableStream<Uint8Array>>;
}>;

export class DownloadTooBig extends Error {
  constructor() {
    super('This file is too big to download in this browser.');
  }
}

/**
 * Decrypts an item's original on this computer and saves it. Where the
 * browser can write a file directly (Chrome, Edge), the plaintext streams
 * straight to disk; otherwise it is built in memory, which is refused above
 * MAX_IN_MEMORY. Cancelling the save dialog resolves quietly.
 */
export async function saveOriginal(
  library: Library,
  item: ItemView,
  w: { showSaveFilePicker?: SavePicker | undefined; document: Document } = {
    showSaveFilePicker: (window as unknown as { showSaveFilePicker?: SavePicker })
      .showSaveFilePicker,
    document,
  },
): Promise<void> {
  const name = item.meta?.name ?? 'photo';
  if (w.showSaveFilePicker) {
    let handle;
    try {
      handle = await w.showSaveFilePicker({ suggestedName: name });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      throw e;
    }
    const out = await handle.createWritable();
    await library.readBlobStream(item, 'original').pipeTo(out);
    return;
  }
  const size = item.blobs.original?.size ?? 0;
  if (size > MAX_IN_MEMORY) throw new DownloadTooBig();
  const bytes = await library.readBlob(item, 'original');
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: item.meta?.mime ?? '' }));
  const a = w.document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
