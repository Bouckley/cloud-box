import { fireEvent, render, screen, within } from '@testing-library/react';
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
    const today = screen.getByRole('region', { name: 'Today' });
    expect(today).toHaveTextContent('2 photos');
    expect(within(today).getAllByRole('link')).toHaveLength(2);
    const yesterday = screen.getByRole('region', { name: 'Yesterday' });
    expect(within(yesterday).getByRole('link')).toHaveAccessibleName(/^Photo, November 2, 2026,/);
  });

  it('tiles link to the viewer and carry no backup badge', () => {
    show([photo('a', '2026-11-03T14:00:00Z', { state: 'stored' })]);
    const tile = screen.getByRole('link', { name: /^Photo, November 3, 2026/ });
    expect(tile).toHaveAttribute('href', '/photos/a');
    expect(tile).not.toHaveTextContent(/safe|backup|pending/i);
  });

  it('one tab stop per day; arrow keys move along the row', () => {
    show([photo('a', '2026-11-03T14:00:00Z'), photo('b', '2026-11-03T13:00:00Z')]);
    const [a, b] = screen.getAllByRole('link');
    expect(a).toHaveAttribute('tabindex', '0');
    expect(b).toHaveAttribute('tabindex', '-1');
    a!.focus();
    fireEvent.keyDown(a!, { key: 'ArrowRight' });
    expect(b).toHaveFocus();
    expect(b).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(b!, { key: 'Home' });
    expect(a).toHaveFocus();
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
});
