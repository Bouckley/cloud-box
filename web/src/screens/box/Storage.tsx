import type { LibrarySnapshot } from '@cloudbox/core';
import { useId } from 'react';
import { bytesText } from '../../app/format.ts';

export type StorageParts = { photos: number; videos: number; files: number };

/**
 * What the library takes, by kind, from the encrypted blob sizes the index
 * already holds: worked out here in the browser, so the box never learns
 * which of its blobs are photos, videos or papers. Trash counts too (it
 * still takes space until it is purged).
 */
export function storageParts(snapshot: LibrarySnapshot): StorageParts {
  const parts: StorageParts = { photos: 0, videos: 0, files: 0 };
  for (const item of snapshot.items.values()) {
    const size = Object.values(item.blobs).reduce((n, b) => n + (b?.size ?? 0), 0);
    if (snapshot.collections.get(item.collectionId)?.kind === 'folder') parts.files += size;
    else if (item.meta?.mime.startsWith('video/')) parts.videos += size;
    else parts.photos += size;
  }
  return parts;
}

type Segment = { key: string; label: string; bytes: number };

/** Sets a width through the CSSOM (allowed by the CSP), never a style attribute. */
const widthOf = (pct: number) => (el: HTMLElement | null) => {
  el?.style.setProperty('width', `${pct}%`);
};

/**
 * The main drive: `{used} of {size} used`, a bar split by kind, and its
 * legend. Space the library doesn't account for (the box's own files, blobs
 * not yet in the index) is `Other`, so the bar adds up to what is used.
 */
export function Storage({
  drive,
  parts,
}: {
  drive: { sizeBytes: number; freeBytes: number } | null;
  parts: StorageParts;
}) {
  const id = useId();
  const used = drive ? Math.max(0, drive.sizeBytes - drive.freeBytes) : 0;
  const known = parts.photos + parts.videos + parts.files;
  // Under 1% of what is used is rounding, not worth a segment.
  const other = Math.max(0, used - known);
  const segments: Segment[] = [
    { key: 'photos', label: 'Photos', bytes: parts.photos },
    { key: 'videos', label: 'Videos', bytes: parts.videos },
    { key: 'files', label: 'Files', bytes: parts.files },
    ...(other > used * 0.01 ? [{ key: 'other', label: 'Other', bytes: other }] : []),
  ];
  const pct = (n: number) => (drive && drive.sizeBytes > 0 ? (n / drive.sizeBytes) * 100 : 0);
  const label = drive
    ? [
        ...segments.map(
          (s, i) => `${i === 0 ? s.label : s.label.toLowerCase()} ${bytesText(s.bytes)}`,
        ),
        `${bytesText(drive.freeBytes)} free`,
      ].join(', ')
    : '';

  return (
    <section className="card box-section" aria-labelledby={`${id}-h`}>
      <div className="storage-head">
        <h2 id={`${id}-h`}>Storage</h2>
        {drive && (
          <p className="storage-head__used">
            <strong>{bytesText(used)}</strong> of {bytesText(drive.sizeBytes)} used
          </p>
        )}
      </div>
      {!drive ? (
        <p className="box-section__waiting">Checking your box…</p>
      ) : (
        <>
          <div className="usage" role="img" aria-label={label}>
            {/* An empty kind would still cost a gap: leave it out of the bar. */}
            {segments
              .filter((s) => s.bytes > 0)
              .map((s) => (
                <span
                  key={s.key}
                  className={`usage__part usage__part--${s.key}`}
                  ref={widthOf(pct(s.bytes))}
                />
              ))}
          </div>
          <ul className="usage-legend" aria-hidden="true">
            {segments.map((s) => (
              <li key={s.key}>
                <span className={`usage-legend__swatch usage__part--${s.key}`} />
                {s.label} {bytesText(s.bytes)}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
