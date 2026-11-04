import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AlbumEntry, AlbumHome } from '../../app/albums.ts';
import { coll } from '../../test/photos.ts';
import { MoveSummary } from './MoveSummary.tsx';

const entry = (id: string, name: string | null): AlbumEntry => ({
  album: coll(id, 'album', { name }),
  count: 9,
  cover: null,
});
const home = (id: string, name: string | null, count: number): AlbumHome => ({
  entry: entry(id, name),
  count,
});
const trips = {
  entry: entry('trips', 'Summer at the lake house'),
  name: 'Summer at the lake house',
};

const rows = () => within(screen.getByRole('region', { name: 'Leaving' })).getAllByRole('listitem');
const movingTo = () => screen.getByRole('region', { name: 'Moving to' });

describe('MoveSummary', () => {
  it('one row per album, with its count', () => {
    render(
      <MoveSummary
        leaving={[home('garden', 'Garden', 3), home('family', 'Family', 2)]}
        target={trips}
        incoming={5}
        fromPhotos={0}
      />,
    );
    const r = rows();
    expect(r).toHaveLength(2);
    expect(r[0]).toHaveTextContent('Garden3 photos');
    expect(r[1]).toHaveTextContent('Family2 photos');
  });

  it('an unreadable album name still reads', () => {
    render(
      <MoveSummary leaving={[home('x', null, 1)]} target={trips} incoming={1} fromPhotos={0} />,
    );
    expect(rows()[0]).toHaveTextContent("Album that can't be read");
  });

  it('four albums show; five fold the rest', () => {
    const five = [5, 4, 3, 2, 1].map((n) => home(`a${n}`, `Album ${n}`, n));
    const { unmount } = render(
      <MoveSummary leaving={five.slice(0, 4)} target={trips} incoming={14} fromPhotos={0} />,
    );
    expect(rows()).toHaveLength(4);
    expect(screen.queryByText(/more album/)).toBeNull();
    unmount();
    render(<MoveSummary leaving={five} target={trips} incoming={15} fromPhotos={0} />);
    const r = rows();
    expect(r).toHaveLength(4);
    expect(r[3]).toHaveTextContent('2 more albums3 photos');
  });

  it('moving to shows the name and, for several, the count', () => {
    const { unmount } = render(
      <MoveSummary leaving={[home('g', 'Garden', 5)]} target={trips} incoming={6} fromPhotos={1} />,
    );
    expect(movingTo()).toHaveTextContent('Moving to');
    expect(movingTo()).toHaveTextContent('Summer at the lake house');
    expect(movingTo()).toHaveTextContent('6 photos in all');
    expect(screen.getByText('1 photo from Photos is added too.')).toBeInTheDocument();
    unmount();

    const second = render(
      <MoveSummary leaving={[home('g', 'Garden', 5)]} target={trips} incoming={5} fromPhotos={0} />,
    );
    expect(movingTo()).toHaveTextContent(/5 photos$/);
    expect(screen.queryByText(/from Photos/)).toBeNull();
    second.unmount();

    render(
      <MoveSummary leaving={[home('g', 'Garden', 1)]} target={trips} incoming={1} fromPhotos={0} />,
    );
    expect(movingTo()).not.toHaveTextContent(/photo/);
  });

  it('says photos from Photos in the plural', () => {
    render(
      <MoveSummary leaving={[home('g', 'Garden', 2)]} target={trips} incoming={5} fromPhotos={3} />,
    );
    expect(screen.getByText('3 photos from Photos are added too.')).toBeInTheDocument();
  });

  it('a new album shows its typed name', () => {
    render(
      <MoveSummary
        leaving={[home('g', 'Garden', 1)]}
        target={{ entry: null, name: 'Trips' }}
        incoming={1}
        fromPhotos={0}
      />,
    );
    expect(movingTo()).toHaveTextContent('Trips');
  });
});
