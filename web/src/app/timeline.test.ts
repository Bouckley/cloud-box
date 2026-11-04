import { describe, expect, it } from 'vitest';
import { photo, snap } from '../test/photos.ts';
import { countText, groupItems, photoItems, tileLabel, whenOf } from './timeline.ts';

const TZ = 'America/Toronto';
const NOW = new Date('2026-11-03T15:00:00Z');

describe('photoItems', () => {
  it('keeps photos in albums, not files or Trash, newest first', () => {
    const items = photoItems(
      snap([
        photo('old', '2026-10-01T10:00:00Z'),
        photo('new', '2026-11-02T10:00:00Z'),
        photo('file', '2026-11-03T10:00:00Z', { collectionId: 'folder' }),
        photo('gone', '2026-11-03T11:00:00Z', { trashedAt: new Date() }),
        photo('nodate', null, {}, { modifiedAt: '2026-10-15T10:00:00Z' }),
      ]),
    );
    expect(items.map((i) => i.id)).toEqual(['new', 'nodate', 'old']);
  });

  it('falls back to modified, then created, when there is no taken date', () => {
    const noDates = photo('x', null, { createdAt: NOW }, { modifiedAt: null });
    expect(whenOf(noDates)).toEqual(NOW);
    expect(whenOf(photo('y', null, {}, { modifiedAt: '2026-01-02T03:04:05Z' }))).toEqual(
      new Date('2026-01-02T03:04:05Z'),
    );
  });
});

describe('groupItems', () => {
  // 02:30 UTC on 3 Nov is still 2 Nov in Toronto.
  const items = [
    photo('a', '2026-11-03T14:00:00Z'),
    photo('b', '2026-11-03T02:30:00Z'),
    photo('c', '2026-10-31T12:00:00Z'),
    photo('d', '2025-06-01T12:00:00Z'),
  ];

  it('groups by day in the browser time zone, with Today and Yesterday', () => {
    const g = groupItems(items, 'days', { timeZone: TZ, now: NOW, locale: 'en-US' });
    expect(g.map((x) => [x.label, x.items.map((i) => i.id)])).toEqual([
      ['Today', ['a']],
      ['Yesterday', ['b']],
      ['Saturday, October 31', ['c']],
      ['Sunday, June 1, 2025', ['d']],
    ]);
  });

  it('groups by month and by year', () => {
    const m = groupItems(items, 'months', { timeZone: TZ, now: NOW, locale: 'en-US' });
    expect(m.map((x) => [x.label, x.items.length])).toEqual([
      ['November 2026', 2],
      ['October 2026', 1],
      ['June 2025', 1],
    ]);
    const y = groupItems(items, 'years', { timeZone: TZ, now: NOW, locale: 'en-US' });
    expect(y.map((x) => [x.label, x.items.length])).toEqual([
      ['2026', 3],
      ['2025', 1],
    ]);
  });

  it('gives each group a stable key', () => {
    const g = groupItems(items, 'days', { timeZone: TZ, now: NOW, locale: 'en-US' });
    expect(g[0]!.key).toBe('2026-11-03');
  });
});

describe('labels', () => {
  it('counts photos and videos in plain words', () => {
    const v = photo('v', null, {}, { mime: 'video/mp4' });
    expect(countText([photo('a', null)])).toBe('1 photo');
    expect(countText([photo('a', null), photo('b', null)])).toBe('2 photos');
    expect(countText([photo('a', null), v])).toBe('1 photo, 1 video');
    expect(countText([v, v])).toBe('2 videos');
  });

  it('names a tile by kind, date and time', () => {
    const opts = { timeZone: TZ, locale: 'en-US' };
    expect(tileLabel(photo('a', '2026-11-03T14:05:00Z'), opts)).toBe(
      'Photo, November 3, 2026, 9:05 AM',
    );
    expect(tileLabel(photo('v', '2026-11-03T14:05:00Z', {}, { mime: 'video/mp4' }), opts)).toBe(
      'Video, November 3, 2026, 9:05 AM',
    );
    expect(tileLabel(photo('u', null, { meta: null }), opts)).toBe("Photo that can't be read");
  });
});
