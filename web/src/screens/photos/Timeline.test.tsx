import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { photo } from '../../test/photos.ts';
import { Timeline } from './Timeline.tsx';

const NOW = new Date('2026-11-03T15:00:00Z');
const TZ = 'America/Toronto';

function show(items = [photo('a', '2026-11-03T14:00:00Z')], extra = {}) {
  return render(
    <MemoryRouter>
      <Timeline items={items} grouping="days" now={NOW} timeZone={TZ} {...extra} />
    </MemoryRouter>,
  );
}

describe('Timeline', () => {
  it('renders a 10,000-photo timeline with under 300 tiles in the DOM', () => {
    // Five photos a day for 2,000 days, newest first.
    const items = Array.from({ length: 10_000 }, (_, i) =>
      photo(
        `p${i}`,
        new Date(NOW.getTime() - Math.floor(i / 5) * 86_400_000 - (i % 5) * 60_000).toISOString(),
      ),
    );
    const { container } = show(items);
    const tiles = container.querySelectorAll('.tile');
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThan(300);
  });

  it('keeps tiles virtual inside a big day too', () => {
    const items = Array.from({ length: 5_000 }, (_, i) =>
      photo(`p${i}`, new Date(NOW.getTime() - i * 1000).toISOString()),
    );
    const { container } = show(items);
    expect(container.querySelectorAll('.tile').length).toBeLessThan(300);
  });

  it('groups by day in the browser time zone, each a heading with its count', () => {
    show([
      photo('a', '2026-11-03T14:00:00Z'),
      photo('b', '2026-11-03T13:00:00Z'),
      photo('c', '2026-11-03T02:30:00Z'),
    ]);
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(['Today', 'Yesterday']);
    expect(screen.getByText('2 photos')).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(links[2]).toHaveAccessibleName(/^Photo, November 2, 2026,/);
  });

  it('tiles link to the viewer and carry no backup badge', () => {
    show([photo('a', '2026-11-03T14:00:00Z', { state: 'stored' })]);
    const tile = screen.getByRole('link', { name: /^Photo, November 3, 2026/ });
    expect(tile).toHaveAttribute('href', '/photos/a');
    expect(tile).not.toHaveTextContent(/safe|backup|pending/i);
  });

  it('one tab stop for the whole timeline; arrows move through the grid', () => {
    // jsdom is 1024 px wide: Days fits 5 columns.
    const day = Array.from({ length: 12 }, (_, i) =>
      photo(`a${i}`, new Date(NOW.getTime() - 3_600_000 - i * 60_000).toISOString()),
    );
    show([...day, photo('y', '2026-11-02T15:00:00Z')]);
    const links = screen.getAllByRole('link');
    expect(links.filter((l) => l.getAttribute('tabindex') === '0')).toHaveLength(1);
    const [a0, a1] = links;
    a0!.focus();
    fireEvent.keyDown(a0!, { key: 'ArrowRight' });
    expect(a1).toHaveFocus();
    fireEvent.keyDown(a1!, { key: 'ArrowDown' });
    expect(links[6]).toHaveFocus();
    fireEvent.keyDown(links[6]!, { key: 'End' });
    expect(links[9]).toHaveFocus();
    fireEvent.keyDown(links[9]!, { key: 'ArrowRight' });
    expect(links[10]).toHaveFocus(); // on to the next row
    fireEvent.keyDown(links[10]!, { key: 'ArrowDown' });
    expect(links[12]).toHaveFocus(); // into Yesterday, same column or its last
    fireEvent.keyDown(links[12]!, { key: 'ArrowUp' });
    expect(links[10]).toHaveFocus();
    fireEvent.keyDown(links[10]!, { key: 'Home', ctrlKey: true });
    expect(a0).toHaveFocus();
  });

  it('select mode: tiles become checkboxes with the same names', () => {
    const onToggle = vi.fn();
    show([photo('a', '2026-11-03T14:00:00Z')], {
      selected: new Set<string>(),
      onToggle,
    });
    expect(screen.queryByRole('link')).toBeNull();
    const box = screen.getByRole('checkbox', { name: /^Photo, November 3, 2026/ });
    fireEvent.click(box);
    expect(onToggle).toHaveBeenCalledWith('a');
  });

  it('a video says so and shows its length', () => {
    show([photo('v', '2026-11-03T14:00:00Z', {}, { mime: 'video/mp4', durationMs: 75_000 })]);
    const tile = screen.getByRole('link', { name: /^Video, / });
    expect(tile).toHaveTextContent('1:15');
  });

  it('coming back from the viewer focuses that tile once, then leaves focus alone', () => {
    const items = [photo('a', '2026-11-03T14:00:00Z'), photo('b', '2026-11-03T13:00:00Z')];
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    const { rerender } = render(
      <MemoryRouter>
        <Timeline items={items} grouping="days" now={NOW} timeZone={TZ} focusId="b" />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('link')[1]).toHaveFocus();
    outside.focus();
    // A new photo arrives (an upload, or another device): the old tile moves.
    rerender(
      <MemoryRouter>
        <Timeline
          items={[photo('new', '2026-11-03T14:30:00Z'), ...items]}
          grouping="days"
          now={NOW}
          timeZone={TZ}
          focusId="b"
        />
      </MemoryRouter>,
    );
    expect(outside).toHaveFocus();
    outside.remove();
  });

  it('tiles keep the grouping in their link', () => {
    render(
      <MemoryRouter initialEntries={['/photos?by=years']}>
        <Timeline
          items={[photo('a', '2026-11-03T14:00:00Z')]}
          grouping="years"
          now={NOW}
          timeZone={TZ}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link')).toHaveAttribute('href', '/photos/a?by=years');
  });

  it('the scrubber jumps by month and says where you are', () => {
    // Two photos a day for 400 days: November 2026 back to late 2025.
    const items = Array.from({ length: 800 }, (_, i) =>
      photo(
        `p${i}`,
        new Date(NOW.getTime() - Math.floor(i / 2) * 86_400_000 - (i % 2) * 60_000).toISOString(),
      ),
    );
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    show(items);
    const bar = screen.getByRole('slider', { name: 'Jump to a date' });
    expect(bar).toHaveAttribute('aria-valuetext', 'November 2026');
    fireEvent.keyDown(bar, { key: 'ArrowDown' });
    expect(bar).toHaveAttribute('aria-valuetext', 'October 2026');
    fireEvent.keyDown(bar, { key: 'PageDown' });
    expect(bar).toHaveAttribute('aria-valuetext', 'December 2025');
    fireEvent.keyDown(bar, { key: 'Home' });
    expect(bar).toHaveAttribute('aria-valuetext', 'November 2026');
    expect(scrollTo).toHaveBeenCalled();
    scrollTo.mockRestore();
  });

  it('no scrubber when everything fits in a couple of screens', () => {
    show([photo('a', '2026-11-03T14:00:00Z')]);
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('small days share a row, each with its own heading', () => {
    // 1024 px wide: 5 columns. Three days of one photo fit in one row.
    const { container } = show([
      photo('a', '2026-11-03T14:00:00Z'),
      photo('b', '2026-11-02T14:00:00Z'),
      photo('c', '2026-11-01T14:00:00Z'),
      ...Array.from({ length: 7 }, (_, i) =>
        photo(`d${i}`, new Date(Date.parse('2026-10-30T14:00:00Z') - i * 60_000).toISOString()),
      ),
    ]);
    const packs = container.querySelectorAll('.timeline__pack');
    expect(packs).toHaveLength(1);
    expect(Array.from(packs[0]!.querySelectorAll('h2')).map((h) => h.textContent)).toEqual([
      'Today',
      'Yesterday',
      'Sun, Nov 1', // one tile wide: the short date
    ]);
    // Reading order runs across the packed days, then down into the next day.
    const [a, b, c, d0] = screen.getAllByRole('link');
    a!.focus();
    fireEvent.keyDown(a!, { key: 'ArrowRight' });
    expect(b).toHaveFocus();
    fireEvent.keyDown(b!, { key: 'ArrowRight' });
    expect(c).toHaveFocus();
    fireEvent.keyDown(c!, { key: 'ArrowDown' });
    expect(screen.getAllByRole('link')[5]).toHaveFocus(); // same column, next row
    fireEvent.keyDown(screen.getAllByRole('link')[5]!, { key: 'ArrowUp' });
    expect(c).toHaveFocus();
    expect(d0).toBeDefined();
  });

  it('a select circle on each photo starts Select with that photo', () => {
    const onPick = vi.fn();
    show([photo('a', '2026-11-03T14:00:00Z')], { onPick });
    fireEvent.click(screen.getByRole('button', { name: /^Select Photo, November 3, 2026/ }));
    expect(onPick).toHaveBeenCalledWith('a');
  });

  it('no select circles once in Select mode', () => {
    show([photo('a', '2026-11-03T14:00:00Z')], {
      onPick: vi.fn(),
      selected: new Set<string>(),
      onToggle: vi.fn(),
    });
    expect(screen.queryByRole('button', { name: /^Select / })).toBeNull();
  });
});
