import type { ItemView } from '@cloudbox/core';
import {
  defaultRangeExtractor,
  observeElementRect,
  useVirtualizer,
  useWindowVirtualizer,
  type Range,
} from '@tanstack/react-virtual';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { ChevronIcon, ChevronLeftIcon } from '../../app/icons.tsx';
import { countText, groupItems, tileLabel, type Group, type Grouping } from '../../app/timeline.ts';
import { Tile } from './Tile.tsx';

/** Tile sides in px: Days large, Months smaller, Years a tight strip. */
const TILE: Record<Grouping, { wide: number; narrow: number }> = {
  days: { wide: 190, narrow: 140 },
  months: { wide: 128, narrow: 104 },
  years: { wide: 88, narrow: 72 },
};
const GAP = 6;
/** Heading row plus the space between groups, before a group is measured. */
const GROUP_CHROME = 92;
const NARROW = '(max-width: 720px)';

function useMedia(query: string): boolean {
  const get = () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  const [on, setOn] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const m = window.matchMedia(query);
    const fn = () => setOn(m.matches);
    m.addEventListener('change', fn);
    return () => m.removeEventListener('change', fn);
  }, [query]);
  return on;
}

const smooth = (): ScrollBehavior =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth';

export type TimelineProps = {
  items: ItemView[];
  grouping: Grouping;
  now?: Date;
  timeZone?: string;
  /** Select mode: the ticked ids, and how to toggle one. */
  selected?: ReadonlySet<string> | undefined;
  onToggle?: ((id: string) => void) | undefined;
  /** Scroll to this photo and focus its tile (coming back from the viewer). */
  focusId?: string | null | undefined;
};

/**
 * The Photos timeline: one row per day (or month, or year), newest first.
 * The page scrolls through groups and each row scrolls sideways; both are
 * virtual, so a 100,000-photo library keeps a few hundred tiles in the page.
 */
export function Timeline({
  items,
  grouping,
  now,
  timeZone,
  selected,
  onToggle,
  focusId,
}: TimelineProps) {
  const narrow = useMedia(NARROW);
  const tile = TILE[grouping][narrow ? 'narrow' : 'wide'];
  const groups = useMemo(
    () => groupItems(items, grouping, { timeZone, now }),
    [items, grouping, timeZone, now],
  );
  const where = useMemo(() => ({ timeZone }), [timeZone]);

  const listRef = useRef<HTMLDivElement>(null);
  const [margin, setMargin] = useState(0);
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) setMargin(el.getBoundingClientRect().top + window.scrollY);
  }, [narrow]);

  const estimate = useCallback(() => GROUP_CHROME + tile, [tile]);
  const rows = useWindowVirtualizer({
    count: groups.length,
    estimateSize: estimate,
    overscan: 3,
    scrollMargin: margin,
    getItemKey: (i) => groups[i]!.key,
    // jsdom (and a hidden tab) measure 0: keep the estimate then.
    measureElement: (el) => el.getBoundingClientRect().height || estimate(),
  });

  // Coming back from the viewer: bring that photo's row into view first.
  // Applied once: later changes (uploads, other devices) never move focus.
  const [focusDone, setFocusDone] = useState<string | null>(null);
  const focusAt = findItem(groups, focusId && focusDone !== focusId ? focusId : null);
  const focusKey = focusAt ? `${focusAt.g}:${focusAt.i}` : null;
  useLayoutEffect(() => {
    if (focusAt) rows.scrollToIndex(focusAt.g, { align: 'center' });
    // Only when the target changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  return (
    <div ref={listRef} className="timeline">
      <div
        className="timeline__inner"
        ref={(el) => {
          el?.style.setProperty('height', `${rows.getTotalSize()}px`);
        }}
      >
        {rows.getVirtualItems().map((row) => {
          const group = groups[row.index]!;
          return (
            <div
              key={row.key}
              data-index={row.index}
              ref={(el) => {
                if (!el) return;
                el.style.setProperty(
                  'transform',
                  `translateY(${row.start - rows.options.scrollMargin}px)`,
                );
                rows.measureElement(el);
              }}
              className="timeline__row"
            >
              <Strip
                group={group}
                tile={tile}
                where={where}
                selected={selected}
                onToggle={onToggle}
                focusIndex={focusAt?.g === row.index ? focusAt.i : null}
                onFocused={() => setFocusDone(focusId ?? null)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function findItem(groups: Group[], id: string | null | undefined) {
  if (!id) return null;
  for (let g = 0; g < groups.length; g++) {
    const i = groups[g]!.items.findIndex((x) => x.id === id);
    if (i >= 0) return { g, i };
  }
  return null;
}

type StripProps = {
  group: Group;
  tile: number;
  where: { timeZone?: string | undefined };
  selected: ReadonlySet<string> | undefined;
  onToggle: ((id: string) => void) | undefined;
  focusIndex: number | null;
  onFocused(): void;
};

/** One group: its heading and count, Previous/Next, and a sideways row of tiles. */
function Strip({ group, tile, where, selected, onToggle, focusIndex, onFocused }: StripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const pendingFocus = useRef<number | null>(null);
  const count = group.items.length;
  const current = Math.min(active, count - 1);

  // The tile that holds the row's tab stop is always in the page.
  const rangeExtractor = useCallback(
    (range: Range) => {
      const out = defaultRangeExtractor(range);
      if (!out.includes(current)) out.push(current);
      return out.sort((a, b) => a - b);
    },
    [current],
  );
  // TanStack Virtual re-renders on scroll itself; the compiler leaves this component unmemoised.
  // eslint-disable-next-line react-hooks/incompatible-library
  const cols = useVirtualizer({
    horizontal: true,
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => tile + GAP,
    overscan: 4,
    rangeExtractor,
    getItemKey: (i) => group.items[i]!.id,
    // A row not yet laid out (jsdom, a hidden tab) reads 0 wide: assume the window's width.
    observeElementRect: (instance, cb) =>
      observeElementRect(instance, (rect) =>
        cb(rect.width ? rect : { width: window.innerWidth, height: tile }),
      ),
  });

  const [edges, setEdges] = useState({ start: true, end: true });
  const readEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ start: el.scrollLeft <= 1, end: el.scrollLeft >= max - 1 });
  }, []);
  useEffect(() => {
    readEdges();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', readEdges, { passive: true });
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(readEdges) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', readEdges);
      ro?.disconnect();
    };
  }, [readEdges, count, tile]);

  const page = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    // Whole tiles: a page is the tiles that fit, less one for context.
    const step = tile + GAP;
    const fit = Math.max(1, Math.floor(el.clientWidth / step) - 1);
    el.scrollBy({ left: dir * fit * step, behavior: smooth() });
  };

  const moveTo = (i: number) => {
    const next = Math.max(0, Math.min(count - 1, i));
    setActive(next);
    pendingFocus.current = next;
    cols.scrollToIndex(next, { align: 'auto' });
  };

  useEffect(() => {
    if (focusIndex !== null) moveTo(focusIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusIndex]);

  useLayoutEffect(() => {
    const want = pendingFocus.current;
    if (want === null) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `[data-col="${want}"] a, [data-col="${want}"] input`,
    );
    if (el) {
      pendingFocus.current = null;
      el.focus({ preventScroll: true });
      onFocused();
    }
  });

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const keys: Record<string, number> = {
      ArrowRight: current + 1,
      ArrowLeft: current - 1,
      Home: 0,
      End: count - 1,
    };
    const to = keys[e.key];
    if (to === undefined) return;
    e.preventDefault();
    moveTo(to);
  };

  const headingId = `day-${group.key}`;
  const scrolls = !(edges.start && edges.end);
  return (
    <section className="strip" aria-labelledby={headingId}>
      <div className="strip__head">
        <div className="strip__title">
          <h2 id={headingId}>{group.label}</h2>
          <p className="strip__count">{countText(group.items)}</p>
        </div>
        {scrolls && (
          <div className="strip__pager">
            <button
              type="button"
              className="button strip__btn"
              onClick={() => page(-1)}
              disabled={edges.start}
              aria-label={`Previous, ${group.label}`}
            >
              <ChevronLeftIcon size={20} />
              <span>Previous</span>
            </button>
            <button
              type="button"
              className="button strip__btn"
              onClick={() => page(1)}
              disabled={edges.end}
              aria-label={`Next, ${group.label}`}
            >
              <span>Next</span>
              <ChevronIcon size={20} />
            </button>
          </div>
        )}
      </div>
      <div className="strip__scroll" ref={scrollRef}>
        <ul
          className="strip__list"
          ref={(el) => {
            if (!el) return;
            el.style.setProperty('width', `${cols.getTotalSize() - GAP}px`);
            el.style.setProperty('height', `${tile}px`);
            el.style.setProperty('--tile', `${tile}px`);
          }}
        >
          {cols.getVirtualItems().map((col) => {
            const item = group.items[col.index]!;
            return (
              <li
                key={col.key}
                data-col={col.index}
                className="strip__item"
                ref={(el) => {
                  el?.style.setProperty('transform', `translateX(${col.start}px)`);
                }}
              >
                <Tile
                  item={item}
                  label={tileLabel(item, where)}
                  tabIndex={col.index === current ? 0 : -1}
                  onKeyDown={onKeyDown}
                  onFocus={() => setActive(col.index)}
                  select={
                    selected && onToggle
                      ? { checked: selected.has(item.id), onToggle: () => onToggle(item.id) }
                      : undefined
                  }
                />
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
