import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { UpDownIcon } from '../../app/icons.tsx';
import type { Group, Grouping } from '../../app/timeline.ts';

/** A place the scrubber can jump to: a month (a year when grouped by years). */
export type Stop = { key: string; label: string; year: string; row: number };

const HANDLE = 48;
/** Year labels closer than this on the track are dropped, so they never overlap. */
const LABEL_GAP = 22;

/**
 * The months (or years) in the timeline, newest first, each with the first
 * row of its first group. Built from the decrypted items in the browser:
 * the box never learns any dates.
 */
export function stopsOf(groups: Group[], grouping: Grouping, groupRow: number[]): Stop[] {
  const stops: Stop[] = [];
  groups.forEach((group, g) => {
    const key = grouping === 'years' ? group.key.slice(0, 4) : group.key.slice(0, 7);
    if (stops.at(-1)?.key === key) return;
    const [y, m] = key.split('-').map(Number);
    const label =
      grouping === 'years'
        ? String(y)
        : new Intl.DateTimeFormat(undefined, {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          }).format(new Date(Date.UTC(y!, m! - 1, 15)));
    stops.push({ key, label, year: key.slice(0, 4), row: groupRow[g] ?? 0 });
  });
  return stops;
}

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

export type ScrubberProps = {
  stops: Stop[];
  /** Each stop's offset in the page, in px (as the list measured it). */
  starts: number[];
  /** Space kept above a stop's heading when jumping to it. */
  padding: number;
  onJump(index: number): void;
};

/**
 * The date scrubber beside the timeline. Drag it (or click the track) to move
 * through the library; with the keyboard it is a slider: ↑ ↓ by month, Page Up
 * and Page Down by year, Home and End. Year marks sit where each year starts.
 */
export function Scrubber({ stops, starts, padding, onJump }: ScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [frac, setFrac] = useState(0);
  const [at, setAt] = useState(0);
  const [max, setMax] = useState(0);
  const [trackH, setTrackH] = useState(0);
  const [dragging, setDragging] = useState(false);
  // Above the first photos (banner and header in view): phones hide the handle.
  const [above, setAbove] = useState(true);
  // A stop chosen with the keyboard near the end of the page, where the
  // page cannot scroll far enough to bring it to the top.
  const pinned = useRef<number | null>(null);
  const latest = useRef({ starts, padding });
  const lastStart = starts.at(-1);
  useLayoutEffect(() => {
    latest.current = { starts, padding };
  });

  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const m = maxScroll();
      const y = window.scrollY;
      const { starts: s, padding: p } = latest.current;
      let i = 0;
      while (i + 1 < s.length && s[i + 1]! - p <= y + 1) i++;
      if (pinned.current !== null && pinned.current > i && y >= m - 1) i = pinned.current;
      setAbove(y + p < (s[0] ?? 0));
      setMax(m);
      setFrac(m > 0 ? clamp(y / m) : 0);
      setAt(i);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
    };
    // The page grows as rows are measured: read again when the last stop moves.
  }, [starts.length, lastStart]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(() => setTrackH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const jump = (i: number) => {
    const to = clamp(i, 0, stops.length - 1);
    pinned.current = to;
    setAt(to);
    onJump(to);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const year = stops[at]!.year;
    const nextYear = () => {
      const j = stops.findIndex((s, k) => k > at && s.year !== year);
      return j < 0 ? stops.length - 1 : j;
    };
    const prevYear = () => {
      let j = at;
      while (j > 0 && stops[j - 1]!.year === year) j--;
      if (j === at && j > 0) {
        const y = stops[j - 1]!.year;
        j--;
        while (j > 0 && stops[j - 1]!.year === y) j--;
      }
      return j;
    };
    const keys: Record<string, () => number> = {
      ArrowDown: () => at + 1,
      ArrowRight: () => at + 1,
      ArrowUp: () => at - 1,
      ArrowLeft: () => at - 1,
      PageDown: nextYear,
      PageUp: prevYear,
      Home: () => 0,
      End: () => stops.length - 1,
    };
    const to = keys[e.key];
    if (!to) return;
    e.preventDefault();
    jump(to());
  };

  const dragTo = (clientY: number) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const f = clamp((clientY - r.top - HANDLE / 2) / Math.max(1, r.height - HANDLE));
    pinned.current = null;
    window.scrollTo({ top: f * maxScroll() });
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragging(true);
    dragTo(e.clientY);
  };

  const room = Math.max(0, trackH - HANDLE);
  const marks: { label: string; top: number }[] = [];
  stops.forEach((s, i) => {
    if (i > 0 && stops[i - 1]!.year === s.year) return;
    const top = (max > 0 ? clamp(((starts[i] ?? 0) - padding) / max) : 0) * room + HANDLE / 2;
    const last = marks.at(-1);
    // A mark under the handle is hidden: the handle's own date covers it.
    const underHandle = Math.abs(top - (frac * room + HANDLE / 2)) < LABEL_GAP;
    if ((!last || top - last.top >= LABEL_GAP) && !underHandle) marks.push({ label: s.year, top });
  });
  const label = stops[at]?.label ?? '';

  return (
    <div className={`scrubber${above && !dragging ? ' scrubber--above' : ''}`}>
      <div
        ref={trackRef}
        className={`scrubber__track${dragging ? ' scrubber__track--dragging' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => dragging && dragTo(e.clientY)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      >
        {marks.map((m) => (
          <span
            key={m.label}
            className="scrubber__year"
            aria-hidden="true"
            ref={(el) => el?.style.setProperty('top', `${m.top}px`)}
          >
            {m.label}
          </span>
        ))}
        <div
          className="scrubber__handle"
          role="slider"
          tabIndex={0}
          aria-label="Jump to a date"
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={stops.length - 1}
          aria-valuenow={at}
          aria-valuetext={label}
          onKeyDown={onKeyDown}
          ref={(el) => el?.style.setProperty('transform', `translateY(${frac * room}px)`)}
        >
          <span className="scrubber__grip">
            <UpDownIcon size={18} />
          </span>
          <span className="scrubber__pill" aria-hidden="true">
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}
