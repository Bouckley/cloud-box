import type { MediaAdapter, MediaInfo, SourceFile } from '@cloudbox/core';

const THUMB = { longest: 320, type: 'image/webp', quality: 0.8 } as const;
const PREVIEW = { longest: 2048, type: 'image/jpeg', quality: 0.85 } as const;
const VIDEO_FRAME_S = 0.5;
const VIDEO_TIMEOUT_MS = 15_000;

const NONE: MediaInfo = { takenAt: null, width: null, height: null, durationMs: null };

/** A browser File as core's SourceFile. Keeps the File so media can decode it. */
export type WebSourceFile = SourceFile & { file: File };

export function fileSource(f: File): WebSourceFile {
  return {
    file: f,
    name: f.name,
    type: f.type,
    size: f.size,
    lastModified: f.lastModified,
    slice: async (start, end) => new Uint8Array(await f.slice(start, end).arrayBuffer()),
  };
}

/**
 * Reads dates and sizes and makes thumbnails on this computer (zero
 * knowledge: the box never sees the picture). Any failure gives nulls and no
 * thumbnail; the item then has its original only and shows a file tile.
 */
export const webMedia: MediaAdapter = {
  async describe(src) {
    const file = (src as Partial<WebSourceFile>).file;
    if (!file) return { ...NONE };
    try {
      if (file.type.startsWith('image/')) return await describeImage(file);
      if (file.type.startsWith('video/')) return await describeVideo(file);
    } catch {
      // fall through
    }
    return { ...NONE };
  },
};

async function describeImage(file: File): Promise<MediaInfo> {
  const takenAt = await exifDate(file);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return { ...NONE, takenAt };
  }
  try {
    const info: MediaInfo = {
      takenAt,
      width: bitmap.width,
      height: bitmap.height,
      durationMs: null,
    };
    const thumb = await encode(bitmap, bitmap.width, bitmap.height, THUMB);
    const preview = await encode(bitmap, bitmap.width, bitmap.height, PREVIEW);
    if (thumb) info.thumb = thumb;
    if (preview) info.preview = preview;
    return info;
  } finally {
    bitmap.close();
  }
}

/** EXIF DateTimeOriginal (or CreateDate). exifr is loaded only when needed. */
async function exifDate(file: File): Promise<Date | null> {
  try {
    const exifr = (await import('exifr')).default;
    const tags = (await exifr.parse(file, ['DateTimeOriginal', 'CreateDate'])) as
      { DateTimeOriginal?: unknown; CreateDate?: unknown } | undefined;
    const d = tags?.DateTimeOriginal ?? tags?.CreateDate;
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  } catch {
    return null;
  }
}

async function describeVideo(file: File): Promise<MediaInfo> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.playsInline = true;
  try {
    await withTimeout(once(video, 'loadeddata', () => (video.src = url)));
    const info: MediaInfo = {
      takenAt: null,
      width: video.videoWidth || null,
      height: video.videoHeight || null,
      durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : null,
    };
    await withTimeout(
      once(video, 'seeked', () => {
        video.currentTime = Math.min(VIDEO_FRAME_S, video.duration || 0);
      }),
    );
    if (video.videoWidth && video.videoHeight) {
      const thumb = await encode(video, video.videoWidth, video.videoHeight, THUMB);
      if (thumb) info.thumb = thumb;
    }
    return info;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

async function encode(
  source: CanvasImageSource,
  w: number,
  h: number,
  o: { longest: number; type: string; quality: number },
): Promise<{ bytes: Uint8Array; mime: string } | undefined> {
  const scale = Math.min(1, o.longest / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = new OffscreenCanvas(cw, ch);
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, cw, ch);
  const blob = await canvas.convertToBlob({ type: o.type, quality: o.quality });
  // A browser that cannot write WebP falls back to PNG; record what it made.
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type || o.type };
}

function once(el: HTMLMediaElement, event: string, start: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    el.addEventListener(event, () => resolve(), { once: true });
    el.addEventListener('error', () => reject(new Error('media error')), { once: true });
    start();
  });
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), VIDEO_TIMEOUT_MS)),
  ]);
}
