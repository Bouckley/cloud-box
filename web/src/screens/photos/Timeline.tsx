import type { ItemView } from '@cloudbox/core';
import { defaultRangeExtractor, useWindowVirtualizer, type Range } from '@tanstack/react-virtual';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { countText, groupItems, tileLabel, type Group, type Grouping } from '../../app/timeline.ts';
import { CheckIcon } from '../../app/icons.tsx';
import { Scrubber, stopsOf } from './Scrubber.tsx';
import { Tile } from './Tile.tsx';

/** Tile sizes the grid aims for, and the fewest columns, per grouping. */
const SIZE: Record<Grouping, { wide: number; narrow: number; minCols: number }> = {
  days: { wide: 180, narrow: 110, minCols: 3 },
  months: { wide: 120, narrow: 80, minCols: 4 },
  years: { wide: 80, narrow: 56, minCols: 6 },
};
/** No tile is ever smaller than a touch target. */
const MIN_TILE = 48;
const GAP = 6;
/** A group heading's height before it is measured (heading, count, space above). */
const HEAD = 72;
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

/** How many columns fit in `width`, and each tile's side. */
export function columns(width: number, grouping: Grouping, narrow: boolean) {
  const s = SIZE[grouping];
  const fit = (side: number) => Math.max(1, Math.floor((width + GAP) / (side + GAP)));
  const cols = Math.min(Math.max(fit(narrow ? s.narrow : s.wide), s.minCols), fit(MIN_TILE));
  return { cols, tile: (width - (cols - 1) * GAP) / cols };
}

/** A cell in a row of tiles: the item and the grid column it sits in. */
type Cell = { item: ItemView; col: number };
/** A small group sharing a row with others: its heading spans `span` columns. */
type Seg = { g: number; span: number; cells: Cell[] };
type Row =
  | { kind: 'head'; key: string; g: number }
  | { kind: 'tiles'; key: string; g: number; cells: Cell[] }
  | { kind: 'pack'; key: string; segs: Seg[]; cells: Cell[] };

/** Narrowest a packed group's heading may be, in px; it wraps inside that. */
const PACK_HEAD = 110;

/**
 * Groups laid out as rows. A group that fits in one row may share it with the
 * groups after it (each with its own heading), so days of one or two photos
 * do not leave most of a row empty. A bigger group gets a heading row, then
 * rows of `cols` tiles.
 */
function layOut(groups: Group[], cols: number, tile: number) {
  const rows: Row[] = [];
  const at = new Map<string, { row: number; col: number }>();
  const order: string[] = [];
  /** The first row of each group, for the scrubber. */
  const groupRow: number[] = [];
  const minSpan = Math.min(cols, Math.ceil(PACK_HEAD / (tile + GAP)));
  let pack: Seg[] = [];
  let used = 0;
  const flush = () => {
    if (!pack.length) return;
    const cells = pack.flatMap((seg) => seg.cells);
    cells.forEach((c) => at.set(c.item.id, { row: rows.length, col: c.col }));
    rows.push({ kind: 'pack', key: `p:${groups[pack[0]!.g]!.key}`, segs: pack, cells });
    pack = [];
    used = 0;
  };
  groups.forEach((group, g) => {
    group.items.forEach((it) => order.push(it.id));
    const n = group.items.length;
    if (n <= cols) {
      const span = Math.min(cols, Math.max(n, minSpan));
      if (used + span > cols) flush();
      groupRow[g] = rows.length;
      const cells = group.items.map((item, i) => ({ item, col: used + i }));
      pack.push({ g, span, cells });
      used += span;
      return;
    }
    flush();
    groupRow[g] = rows.length;
    rows.push({ kind: 'head', key: `h:${group.key}`, g });
    for (let i = 0; i < n; i += cols) {
      const cells = group.items.slice(i, i + cols).map((item, col) => ({ item, col }));
      cells.forEach((c) => at.set(c.item.id, { row: rows.length, col: c.col }));
      rows.push({ kind: 'tiles', key: `t:${group.key}:${i}`, g, cells });
    }
  });
  flush();
  return { rows, at, order, groupRow };
}

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
  /** Outside Select mode: a photo's select circle was clicked. */
  onPick?: ((id: string) => void) | undefined;
};

/**
 * The Photos timeline: a grid of square tiles under a heading per day (or
 * month, or year), newest first, with a scrubber to jump through time. Rows
 * are virtual, so a 100,000-photo library keeps a few hundred tiles in the
 * page, however many photos one day holds.
 */
export function Timeline({
  items,
  grouping,
  now,
  timeZone,
  selected,
  onToggle,
  focusId,
  onPick,
}: TimelineProps) {
  const narrow = useMedia(NARROW);
  const groups = useMemo(
    () => groupItems(items, grouping, { timeZone, now }),
    [items, grouping, timeZone, now],
  );
  const where = useMemo(() => ({ timeZone }), [timeZone]);

  const listRef = useRef<HTMLDivElement>(null);
  const [margin, setMargin] = useState(0);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const read = () => {
      setMargin(el.getBoundingClientRect().top + window.scrollY);
      // jsdom (and a hidden tab) measure 0: assume the window's width then.
      setWidth(el.clientWidth || window.innerWidth);
    };
    read();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(read) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [narrow]);

  const { cols, tile } = columns(width || window.innerWidth, grouping, narrow);
  const { rows, at, order, groupRow } = useMemo(
    () => layOut(groups, cols, tile),
    [groups, cols, tile],
  );
  const stops = useMemo(() => stopsOf(groups, grouping, groupRow), [groups, grouping, groupRow]);

  // The roving tab stop: one tile in the whole timeline is reachable by Tab.
  const [activeId, setActiveId] = useState<string | null>(null);
  // Coming back from the viewer: that photo holds the tab stop and gets focus.
  // Applied once: later changes (uploads, other devices) never move focus.
  const [focusDone, setFocusDone] = useState<string | null>(null);
  const focusTarget = focusId && focusDone !== focusId && at.has(focusId) ? focusId : null;
  const active = focusTarget ?? (activeId && at.has(activeId) ? activeId : (order[0] ?? null));
  const activeRow = active ? at.get(active)!.row : -1;
  const pendingFocus = useRef<string | null>(null);

  const estimate = useCallback(
    (i: number) => {
      const kind = rows[i]?.kind;
      return kind === 'head' ? HEAD : kind === 'pack' ? HEAD + tile + GAP : tile + GAP;
    },
    [rows, tile],
  );
  const rangeExtractor = useCallback(
    (range: Range) => {
      const out = defaultRangeExtractor(range);
      if (activeRow >= 0 && !out.includes(activeRow)) out.push(activeRow);
      return out.sort((a, b) => a - b);
    },
    [activeRow],
  );
  const list = useWindowVirtualizer({
    count: rows.length,
    estimateSize: estimate,
    overscan: 4,
    scrollMargin: margin,
    scrollPaddingStart: 16,
    rangeExtractor,
    getItemKey: (i) => rows[i]!.key,
    measureElement: (el) =>
      el.getBoundingClientRect().height || estimate(Number(el.getAttribute('data-index'))),
  });

  const moveTo = (id: string | undefined) => {
    if (!id) return;
    setActiveId(id);
    pendingFocus.current = id;
    list.scrollToIndex(at.get(id)!.row, { align: 'auto' });
  };

  useLayoutEffect(() => {
    if (!focusTarget) return;
    pendingFocus.current = focusTarget;
    list.scrollToIndex(at.get(focusTarget)!.row, { align: 'center' });
    // Only when the target changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTarget]);

  useLayoutEffect(() => {
    const want = pendingFocus.current;
    if (!want) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-cell="${CSS.escape(want)}"] a, [data-cell="${CSS.escape(want)}"] input`,
    );
    if (el) {
      pendingFocus.current = null;
      el.focus({ preventScroll: true });
    }
  });

  /** The tile `steps` rows of tiles down (or up), in the same column or the nearest one. */
  const vertical = (id: string, dir: 1 | -1, steps = 1): string | undefined => {
    const { row, col } = at.get(id)!;
    let target: string | undefined;
    for (let r = row + dir, n = 0; r >= 0 && r < rows.length && n < steps; r += dir) {
      const next = rows[r]!;
      if (next.kind === 'head') continue;
      const near = next.cells.reduce((a, b) =>
        Math.abs(b.col - col) < Math.abs(a.col - col) ? b : a,
      );
      target = near.item.id;
      n++;
    }
    return target;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!active) return;
    const { row } = at.get(active)!;
    const line = rows[row] as Exclude<Row, { kind: 'head' }>;
    const i = order.indexOf(active);
    const page = Math.max(1, Math.floor(window.innerHeight / (tile + GAP)) - 1);
    const keys: Record<string, () => string | undefined> = {
      ArrowRight: () => order[i + 1],
      ArrowLeft: () => order[i - 1],
      ArrowDown: () => vertical(active, 1),
      ArrowUp: () => vertical(active, -1),
      PageDown: () => vertical(active, 1, page),
      PageUp: () => vertical(active, -1, page),
      Home: () => (e.ctrlKey || e.metaKey ? order[0] : line.cells[0]!.item.id),
      End: () => (e.ctrlKey || e.metaKey ? order.at(-1) : line.cells.at(-1)!.item.id),
    };
    const to = keys[e.key];
    if (!to) return;
    e.preventDefault();
    moveTo(to());
  };

  const pickable = !selected && onPick;
  const cell = ({ item }: Cell) => {
    const label = tileLabel(item, where);
    return (
      <li key={item.id} data-cell={item.id} className="timeline__cell">
        <Tile
          item={item}
          label={label}
          tabIndex={item.id === active ? 0 : -1}
          onKeyDown={onKeyDown}
          onFocus={() => {
            setActiveId(item.id);
            if (item.id === focusTarget) setFocusDone(item.id);
          }}
          select={
            selected && onToggle
              ? { checked: selected.has(item.id), onToggle: () => onToggle(item.id) }
              : undefined
          }
        />
        {pickable && (
          // Mouse and trackpad only (Select in the header does the same from
          // the keyboard), so the grid stays one tab stop.
          <button
            type="button"
            className="tile-pick"
            tabIndex={-1}
            aria-label={`Select ${label}`}
            onClick={() => onPick(item.id)}
          >
            <CheckIcon size={16} />
          </button>
        )}
      </li>
    );
  };

  // Decided from the layout, not from measured heights: the scrubber's column
  // narrows the grid, which changes measured heights, which must not flip it.
  const laidOut = rows.reduce((n, _r, i) => n + estimate(i), 0);
  const showScrubber = stops.length > 1 && laidOut > window.innerHeight * 2.5;
  const starts = stops.map((s) => list.measurementsCache[s.row]?.start ?? 0);

  return (
    <div className={`timeline${showScrubber ? ' timeline--scrub' : ''}`}>
      <div ref={listRef} className="timeline__list">
        <div
          className="timeline__inner"
          ref={(el) => {
            el?.style.setProperty('height', `${list.getTotalSize()}px`);
            el?.style.setProperty('--cols', String(cols));
          }}
        >
          {list.getVirtualItems().map((v) => {
            const row = rows[v.index]!;
            const first = v.index === 0;
            return (
              <div
                key={v.key}
                data-index={v.index}
                className="timeline__row"
                ref={(el) => {
                  if (!el) return;
                  el.style.setProperty(
                    'transform',
                    `translateY(${v.start - list.options.scrollMargin}px)`,
                  );
                  list.measureElement(el);
                }}
              >
                {row.kind === 'head' ? (
                  <Heading group={groups[row.g]!} first={first} />
                ) : row.kind === 'tiles' ? (
                  <ul className="timeline__tiles">{row.cells.map(cell)}</ul>
                ) : (
                  <div className={`timeline__pack${first ? ' timeline__pack--first' : ''}`}>
                    {row.segs.map((seg) => (
                      <div
                        key={seg.g}
                        className="timeline__seg"
                        style={{ gridColumn: `span ${seg.span}` }}
                      >
                        <Heading group={groups[seg.g]!} first short={seg.span === 1} />
                        <ul className="timeline__tiles">{seg.cells.map(cell)}</ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {showScrubber && (
        <Scrubber
          stops={stops}
          starts={starts}
          padding={16}
          onJump={(i) => list.scrollToIndex(stops[i]!.row, { align: 'start' })}
        />
      )}
    </div>
  );
}

/** A group's heading and count; the short date when it is one tile wide. */
function Heading({ group, first, short }: { group: Group; first: boolean; short?: boolean }) {
  return (
    <div className={`timeline__head${first ? ' timeline__head--first' : ''}`}>
      <h2>{short ? group.short : group.label}</h2>
      <p className="timeline__count">{countText(group.items)}</p>
    </div>
  );
}
