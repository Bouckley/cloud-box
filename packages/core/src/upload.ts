import {
  ad,
  ciphertextSize,
  createDedupeHasher,
  createFileEncryptor,
  createSha256,
  encryptFile,
  FILE_CHUNK_BYTES,
  newId,
  randomKey,
  wrapKey,
  type BlobRole,
} from '@cloudbox/crypto';
import { BoxError, ClientError } from './errors.ts';
import { encodeMeta, parseMeta, type ItemMeta } from './meta.ts';
import { b64, must, type AuthedClient } from './transport.ts';

/** A file to upload. The web wraps a File; tests wrap bytes. */
export type SourceFile = {
  name: string;
  type: string;
  size: number;
  lastModified: number;
  slice(start: number, end: number): Promise<Uint8Array>;
};

export type MediaInfo = {
  takenAt: Date | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  thumb?: { bytes: Uint8Array; mime: string };
  preview?: { bytes: Uint8Array; mime: string };
};

/** Reads dates and sizes and makes thumbnails, on the device (never the box). */
export type MediaAdapter = { describe(f: SourceFile): Promise<MediaInfo> };

export const noMedia: MediaAdapter = {
  describe: async () => ({ takenAt: null, width: null, height: null, durationMs: null }),
};

export type UploadResult =
  { kind: 'uploaded'; itemId: string } | { kind: 'duplicate'; itemId: string; trashed: boolean };

export type UploadOptions = {
  /** Encrypted bytes of the original sent so far, and in all. */
  onProgress?(sentBytes: number, totalBytes: number): void;
  /** Stops between parts with an AbortError. */
  signal?: AbortSignal;
  /** For tests: replaces the wait between retries. */
  sleep?(ms: number): Promise<void>;
};

export type UploadContext = {
  api: AuthedClient;
  dedupeKey: Uint8Array;
  collectionKey: Uint8Array;
  collectionId: string;
  /** Throws when the account was locked; checked before every step. */
  alive(): void;
};

/** What every step checks before it starts. */
type Step = { signal?: AbortSignal | undefined; alive?: () => void };

/** Waits before retry 1, 2 and 3 of a part (ADR 0005). */
export const RETRY_DELAYS_MS = [1000, 4000, 10000] as const;

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function checkAbort(step: Step): void {
  step.alive?.();
  if (step.signal?.aborted) throw new DOMException('The upload was stopped.', 'AbortError');
}

/** Network failures and server-side errors are worth another try; refusals are not. */
function retryable(e: unknown): boolean {
  if (e instanceof ClientError) return e.code === 'box_unreachable';
  // Not 507 storage_full: waiting will not free space.
  if (e instanceof BoxError) return [408, 429, 500, 502, 503, 504].includes(e.status);
  return false;
}

async function withRetry<T>(fn: () => Promise<T>, o: UploadOptions & Step): Promise<T> {
  const sleep = o.sleep ?? realSleep;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= RETRY_DELAYS_MS.length || !retryable(e)) throw e;
      await sleep(RETRY_DELAYS_MS[attempt]!);
      checkAbort(o);
    }
  }
}

/** Reads the file in chunks, checking each chunk is the length the file said. */
async function* chunks(
  f: SourceFile,
  step: Step,
): AsyncGenerator<{
  bytes: Uint8Array;
  last: boolean;
}> {
  let off = 0;
  do {
    checkAbort(step);
    const end = Math.min(f.size, off + FILE_CHUNK_BYTES);
    const bytes = await f.slice(off, end);
    if (bytes.length !== end - off) throw changed();
    off = end;
    yield { bytes, last: off >= f.size };
  } while (off < f.size);
}

function changed(): ClientError {
  return new ClientError('file_changed');
}

/** One encrypted blob going up in fixed-size parts, hashed as it goes. */
class BlobUpload {
  readonly #api: AuthedClient;
  readonly #o: UploadOptions;
  readonly #id: string;
  readonly #partBytes: number;
  readonly #size: number;
  readonly #hash = createSha256();
  #buf: Uint8Array;
  #fill = 0;
  #part = 0;
  #sent = 0;

  private constructor(
    api: AuthedClient,
    o: UploadOptions,
    id: string,
    partBytes: number,
    size: number,
  ) {
    this.#api = api;
    this.#o = o;
    this.#id = id;
    this.#partBytes = partBytes;
    this.#size = size;
    this.#buf = new Uint8Array(Math.min(partBytes, size));
  }

  static async start(api: AuthedClient, o: UploadOptions, size: number): Promise<BlobUpload> {
    checkAbort(o);
    const up = await withRetry(
      async () => must(await api.POST('/v1/uploads', { body: { size } })),
      o,
    );
    return new BlobUpload(api, o, up.id, up.partBytes, size);
  }

  get sent(): number {
    return this.#sent;
  }

  async write(b: Uint8Array, onPart?: () => void): Promise<void> {
    this.#hash.update(b);
    let at = 0;
    while (at < b.length) {
      if (this.#buf.length === 0) throw changed();
      const take = Math.min(b.length - at, this.#buf.length - this.#fill);
      this.#buf.set(b.subarray(at, at + take), this.#fill);
      this.#fill += take;
      at += take;
      if (this.#fill === this.#buf.length) {
        await this.#flush();
        onPart?.();
      }
    }
  }

  async #flush(): Promise<void> {
    checkAbort(this.#o);
    const body = this.#buf;
    const n = this.#part;
    await withRetry(
      async () =>
        must(
          await this.#api.PUT('/v1/uploads/{id}/parts/{n}', {
            headers: { 'Content-Type': 'application/octet-stream' },
            params: { path: { id: this.#id, n } },
            body: body as unknown as string,
            bodySerializer: (x: unknown) => x as BodyInit,
          }),
        ),
      this.#o,
    );
    this.#sent += body.length;
    this.#part++;
    this.#fill = 0;
    // A fresh buffer per part: the last request may still hold the old one.
    this.#buf = new Uint8Array(Math.min(this.#partBytes, this.#size - this.#sent));
  }

  /** Sends the hash of everything written; returns the blob id. */
  async complete(): Promise<string> {
    if (this.#sent !== this.#size || this.#fill !== 0) throw changed();
    checkAbort(this.#o);
    const digest = hex(this.#hash.digest());
    const blob = await withRetry(
      async () =>
        must(
          await this.#api.POST('/v1/uploads/{id}/complete', {
            params: { path: { id: this.#id } },
            body: { sha256: digest },
          }),
        ),
      this.#o,
    );
    return blob.id;
  }
}

/** The keyed hash of the file's plaintext, read once before anything is uploaded. */
async function dedupePass(f: SourceFile, key: Uint8Array, step: Step): Promise<string> {
  const h = createDedupeHasher(key);
  for await (const c of chunks(f, step)) h.update(c.bytes);
  return h.digest();
}

async function lookup(
  api: AuthedClient,
  hash: string,
  o: UploadOptions,
): Promise<UploadResult | null> {
  const { found } = await withRetry(
    async () => must(await api.POST('/v1/items/lookup', { body: { dedupeHashes: [hash] } })),
    o,
  );
  const hit = found.find((x) => x.dedupeHash === hash);
  return hit ? { kind: 'duplicate', itemId: hit.itemId, trashed: hit.trashed } : null;
}

async function describe(media: MediaAdapter, f: SourceFile): Promise<MediaInfo> {
  try {
    return await media.describe(f);
  } catch {
    // An image the device cannot decode is stored as the original only.
    return noMedia.describe(f);
  }
}

const count = (v: number | null | undefined) =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
/** RFC 3339 only covers years 0000–9999; anything else is unknown. */
const time = (d: Date | null | undefined) => {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  return y >= 0 && y <= 9999 ? d.toISOString() : null;
};

async function smallBlob(
  api: AuthedClient,
  o: UploadOptions,
  fileKey: Uint8Array,
  itemId: string,
  role: BlobRole,
  bytes: Uint8Array,
): Promise<string> {
  const ct = encryptFile(fileKey, bytes, ad.itemBlob(itemId, role));
  const up = await BlobUpload.start(api, o, ct.length);
  await up.write(ct);
  return up.complete();
}

/**
 * The upload pipeline (ADR 0005): dedupe pass and lookup, then encrypt and
 * stream the original in parts (hash at complete), then the thumb and
 * preview, then the item. Only ciphertext, sizes, hashes and ids are sent.
 */
export async function uploadFile(
  ctx: UploadContext,
  f: SourceFile,
  media: MediaAdapter,
  options: UploadOptions = {},
): Promise<UploadResult> {
  const { api } = ctx;
  const o: UploadOptions & Step = { ...options, alive: ctx.alive };
  checkAbort(o);
  if (!Number.isSafeInteger(f.size) || f.size < 0) throw changed();

  const dedupeHash = await dedupePass(f, ctx.dedupeKey, o);
  checkAbort(o);
  const dup = await lookup(api, dedupeHash, o);
  if (dup) return dup;

  const info = await describe(media, f);
  const itemId = newId();
  const fileKey = randomKey();
  try {
    // The original, streamed. The file is hashed again as it is read so a
    // file that changed since the dedupe pass is not stored under the old hash.
    const total = ciphertextSize(f.size);
    const enc = createFileEncryptor(fileKey, ad.itemBlob(itemId, 'original'));
    const again = createDedupeHasher(ctx.dedupeKey);
    const up = await BlobUpload.start(api, o, total);
    const progress = () => o.onProgress?.(up.sent, total);
    await up.write(enc.header, progress);
    for await (const c of chunks(f, o)) {
      again.update(c.bytes);
      await up.write(enc.push(c.bytes, c.last), progress);
    }
    if (again.digest() !== dedupeHash) throw changed();
    const blobs: { original: string; thumb?: string; preview?: string } = {
      original: await up.complete(),
    };

    if (info.thumb)
      blobs.thumb = await smallBlob(api, o, fileKey, itemId, 'thumb', info.thumb.bytes);
    if (info.preview) {
      blobs.preview = await smallBlob(api, o, fileKey, itemId, 'preview', info.preview.bytes);
    }

    const meta: ItemMeta = {
      v: 1,
      name: f.name,
      mime: f.type || 'application/octet-stream',
      size: f.size,
      modifiedAt: Number.isFinite(f.lastModified) ? time(new Date(f.lastModified)) : null,
      takenAt: time(info.takenAt),
      width: count(info.width),
      height: count(info.height),
      durationMs: count(info.durationMs),
      favourite: false,
      thumbMime: blobs.thumb ? info.thumb!.mime : null,
      previewMime: blobs.preview ? info.preview!.mime : null,
    };
    // Never store metadata this app could not read back.
    if (!parseMeta(meta)) throw new Error('Could not describe this file.');
    const res = await withRetry(() => {
      // Checked in the same turn as the wrap, so a lock cannot slip between.
      checkAbort(o);
      return api
        .POST('/v1/items', {
          body: {
            id: itemId,
            collectionId: ctx.collectionId,
            fileKeyEnc: b64(wrapKey(ctx.collectionKey, fileKey, ad.itemFileKey(itemId))),
            metadataEnc: b64(encodeMeta(fileKey, itemId, meta)),
            dedupeHash,
            blobs,
          },
        })
        .then((r) => {
          // A retried create that had already landed comes back as id_taken.
          if (r.response.status === 409 && (r.error as { code?: string })?.code === 'id_taken') {
            return null;
          }
          must(r);
          return r;
        });
    }, o).catch(async (e: unknown) => {
      // Another device stored the same file meanwhile.
      if (e instanceof BoxError && e.code === 'already_stored') {
        const hit = await lookup(api, dedupeHash, o);
        if (hit) return hit;
      }
      throw e;
    });
    if (res && 'kind' in res) return res;
    return { kind: 'uploaded', itemId };
  } finally {
    fileKey.fill(0);
  }
}
