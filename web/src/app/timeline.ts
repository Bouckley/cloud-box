import type { ItemView, LibrarySnapshot } from '@cloudbox/core';

export type Grouping = 'days' | 'months' | 'years';

/** `short` is for a heading only one tile wide, e.g. "Sat, Oct 31". */
export type Group = { key: string; label: string; short: string; items: ItemView[] };

type Where = { timeZone?: string | undefined; locale?: string | undefined };

/** When a photo was taken: its taken date, else the file's date, else upload time. */
export function whenOf(item: ItemView): Date {
  const iso = item.meta?.takenAt ?? item.meta?.modifiedAt ?? null;
  return iso ? new Date(iso) : item.createdAt;
}

export const isVideo = (item: ItemView) => item.meta?.mime.startsWith('video/') ?? false;

/** Every photo in every album, not in Trash, newest first (scope ruling S6). */
export function photoItems(snapshot: LibrarySnapshot): ItemView[] {
  const out: { item: ItemView; t: number }[] = [];
  for (const item of snapshot.items.values()) {
    if (item.trashedAt) continue;
    if (snapshot.collections.get(item.collectionId)?.kind !== 'album') continue;
    out.push({ item, t: whenOf(item).getTime() });
  }
  out.sort((a, b) => b.t - a.t || (a.item.id < b.item.id ? -1 : 1));
  return out.map((x) => x.item);
}

/** The calendar day of a date in a time zone, as YYYY-MM-DD. */
function dayKey(d: Date, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Groups items (already newest first) by day, month or year in the browser's zone. */
export function groupItems(
  items: ItemView[],
  grouping: Grouping,
  o: Where & { now?: Date | undefined } = {},
): Group[] {
  const now = o.now ?? new Date();
  const today = dayKey(now, o.timeZone);
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000), o.timeZone);
  const thisYear = today.slice(0, 4);
  const dayFmt = new Intl.DateTimeFormat(o.locale, {
    timeZone: o.timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const dayYearFmt = new Intl.DateTimeFormat(o.locale, {
    timeZone: o.timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const monthFmt = new Intl.DateTimeFormat(o.locale, {
    timeZone: o.timeZone,
    month: 'long',
    year: 'numeric',
  });
  const short = (o2: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(o.locale, { timeZone: o.timeZone, ...o2 });
  const dayShort = short({ weekday: 'short', month: 'short', day: 'numeric' });
  const dayYearShort = short({ weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const monthShort = short({ month: 'short', year: 'numeric' });

  const groups: Group[] = [];
  let current = null as Group | null;
  for (const item of items) {
    const when = whenOf(item);
    const day = dayKey(when, o.timeZone);
    const key =
      grouping === 'days' ? day : grouping === 'months' ? day.slice(0, 7) : day.slice(0, 4);
    if (current?.key !== key) {
      let label: string;
      let shortLabel: string;
      if (grouping === 'years') label = shortLabel = key;
      else if (grouping === 'months') {
        label = monthFmt.format(when);
        shortLabel = monthShort.format(when);
      } else if (key === today) label = shortLabel = 'Today';
      else if (key === yesterday) label = shortLabel = 'Yesterday';
      else {
        const sameYear = key.startsWith(thisYear);
        label = (sameYear ? dayFmt : dayYearFmt).format(when);
        shortLabel = (sameYear ? dayShort : dayYearShort).format(when);
      }
      current = { key, label, short: shortLabel, items: [] };
      groups.push(current);
    }
    current.items.push(item);
  }
  return groups;
}

const plural = (n: number, one: string) => `${n.toLocaleString()} ${one}${n === 1 ? '' : 's'}`;

/** "3 photos", "1 photo, 2 videos". */
export function countText(items: ItemView[]): string {
  const videos = items.filter(isVideo).length;
  const photos = items.length - videos;
  if (!videos) return plural(photos, 'photo');
  if (!photos) return plural(videos, 'video');
  return `${plural(photos, 'photo')}, ${plural(videos, 'video')}`;
}

/** The date and time a screen reader hears for a photo, e.g. "November 3, 2026, 9:05 AM". */
export function whenText(item: ItemView, o: Where = {}): string {
  const when = whenOf(item);
  const date = new Intl.DateTimeFormat(o.locale, { timeZone: o.timeZone, dateStyle: 'long' });
  const time = new Intl.DateTimeFormat(o.locale, { timeZone: o.timeZone, timeStyle: 'short' });
  return `${date.format(when)}, ${time.format(when)}`;
}

/** "Photo, {date}, {time}" or "Video, …"; unreadable items say so. */
export function tileLabel(item: ItemView, o: Where = {}): string {
  if (!item.meta) return "Photo that can't be read";
  return `${isVideo(item) ? 'Video' : 'Photo'}, ${whenText(item, o)}`;
}
