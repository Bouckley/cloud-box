import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AlbumEntry, AlbumHome } from '../../app/albums.ts';
import { coll, photo } from '../../test/photos.ts';
import { AlbumPicker } from './AlbumPicker.tsx';

const family: AlbumEntry = {
  album: coll('family', 'album', { name: 'Family' }),
  count: 1,
  cover: null,
};
const albums: AlbumEntry[] = [
  { album: coll('family', 'album', { name: 'Family' }), count: 1, cover: null },
  {
    album: coll('garden', 'album', { name: 'Garden' }),
    count: 12,
    cover: photo('g', '2026-10-01T10:00:00Z'),
  },
];

function open(over: Partial<Parameters<typeof AlbumPicker>[0]> = {}) {
  const props = {
    albums,
    count: 2,
    homes: [] as AlbumHome[],
    onlyInPhotos: 2,
    unmovable: 0,
    onAdd: vi.fn(() => Promise.resolve()),
    onClose: vi.fn(),
    ...over,
  };
  render(<AlbumPicker {...props} />);
  return props;
}

describe('AlbumPicker', () => {
  it('lists each album with its count, plus New album; the first is chosen', () => {
    open();
    expect(screen.getByRole('dialog', { name: 'Add to album' })).toBeInTheDocument();
    const family = screen.getByRole('radio', { name: 'Family' });
    expect(family).toBeChecked();
    expect(family).toHaveFocus();
    expect(family).toHaveAccessibleDescription('1 photo');
    expect(screen.getByRole('radio', { name: 'Garden' })).toHaveAccessibleDescription('12 photos');
    expect(screen.getByRole('radio', { name: 'New album' })).not.toBeChecked();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('adds to the chosen album', async () => {
    const p = open();
    fireEvent.click(screen.getByRole('radio', { name: 'Garden' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(p.onAdd).toHaveBeenCalledWith({ id: 'garden', name: 'Garden' });
    await vi.waitFor(() => expect(p.onClose).toHaveBeenCalled());
  });

  it('with no albums yet, New album is chosen and its name is asked for', () => {
    const p = open({ albums: [] });
    expect(screen.getByRole('radio', { name: 'New album' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Give the album a name.');
    expect(p.onAdd).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Album name' }), {
      target: { value: ' Garden ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(p.onAdd).toHaveBeenCalledWith({ newName: 'Garden' });
  });

  it('photos leaving: Add asks first, then Move photo moves', async () => {
    const p = open({ count: 1, homes: [{ entry: family, count: 1 }], onlyInPhotos: 0 });
    fireEvent.click(screen.getByRole('radio', { name: 'Garden' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(p.onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Move this photo?' })).toHaveTextContent(
      'A photo lives in one album, so it will only be in the new one.',
    );
    expect(screen.getByRole('region', { name: 'Leaving' })).toHaveTextContent('Family');
    expect(screen.getByRole('region', { name: 'Moving to' })).toHaveTextContent('Garden');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Move photo' }));
    expect(p.onAdd).toHaveBeenCalledWith({ id: 'garden', name: 'Garden' });
    await vi.waitFor(() => expect(p.onClose).toHaveBeenCalled());
  });

  it('the chosen album is not counted as leaving', () => {
    const garden = albums[1]!;
    open({
      count: 3,
      homes: [
        { entry: garden, count: 2 },
        { entry: family, count: 1 },
      ],
      onlyInPhotos: 0,
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Garden' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('heading', { name: 'Move this photo?' })).toBeInTheDocument();
    const leaving = within(screen.getByRole('region', { name: 'Leaving' })).getAllByRole(
      'listitem',
    );
    expect(leaving).toHaveLength(1);
    expect(leaving[0]).toHaveTextContent('Family');
  });

  it('several: heading counts only those leaving', async () => {
    const garden = albums[1]!;
    const p = open({
      count: 6,
      homes: [
        { entry: garden, count: 3 },
        { entry: family, count: 2 },
      ],
      onlyInPhotos: 1,
    });
    fireEvent.click(screen.getByRole('radio', { name: 'New album' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Album name' }), {
      target: { value: 'Trips' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('dialog', { name: 'Move 5 photos?' })).toHaveTextContent(
      'A photo lives in one album, so these will only be in the new one.',
    );
    expect(screen.getByRole('region', { name: 'Moving to' })).toHaveTextContent('Trips');
    expect(screen.getByRole('region', { name: 'Moving to' })).toHaveTextContent('6 photos in all');
    fireEvent.click(screen.getByRole('button', { name: 'Move photos' }));
    expect(p.onAdd).toHaveBeenCalledWith({ newName: 'Trips' });
    await vi.waitFor(() => expect(p.onClose).toHaveBeenCalled());
  });

  it('Cancel goes back with the choice kept', () => {
    const p = open({ count: 1, homes: [{ entry: family, count: 1 }], onlyInPhotos: 0 });
    fireEvent.click(screen.getByRole('radio', { name: 'Garden' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('dialog', { name: 'Add to album' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Garden' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Garden' })).toHaveFocus();
    expect(p.onClose).not.toHaveBeenCalled();
  });

  it('a failed move stays on the confirm step', async () => {
    const onAdd = vi.fn(() => Promise.reject(new Error('x')));
    open({ count: 1, homes: [{ entry: family, count: 1 }], onlyInPhotos: 0, onAdd });
    fireEvent.click(screen.getByRole('radio', { name: 'Garden' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move photo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't add it to the album. Try again.",
    );
    expect(screen.getByRole('heading', { name: 'Move this photo?' })).toBeInTheDocument();
    const move = screen.getByRole('button', { name: 'Move photo' });
    expect(move).toBeEnabled();
    fireEvent.click(move);
    expect(onAdd).toHaveBeenCalledTimes(2);
  });

  it('busy says Moving…', () => {
    open({
      count: 1,
      homes: [{ entry: family, count: 1 }],
      onlyInPhotos: 0,
      onAdd: vi.fn(() => new Promise<void>(() => {})),
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Garden' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move photo' }));
    expect(screen.getByRole('button', { name: 'Moving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('says plainly when some photos cannot be moved', () => {
    open({ count: 3, unmovable: 1 });
    expect(screen.getByRole('dialog')).toHaveTextContent(
      "1 photo can't be moved because its album can't be read.",
    );
  });

  it('says nothing about unmovable photos when every photo can move', () => {
    open();
    expect(screen.getByRole('dialog')).not.toHaveTextContent("can't be moved");
  });

  it('a failure says so and stays open', async () => {
    const p = open({ onAdd: vi.fn(() => Promise.reject(new Error('x'))) });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't add them to the album. Try again.",
    );
    expect(p.onClose).not.toHaveBeenCalled();
  });
});
