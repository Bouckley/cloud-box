import type { ItemView } from '@cloudbox/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { photo } from '../../test/photos.ts';
import { Viewer, type ViewerProps } from './Viewer.tsx';

const TZ = 'America/Toronto';

function show(item: ItemView, over: Partial<ViewerProps> = {}) {
  const props: ViewerProps = {
    item,
    timeZone: TZ,
    hasPrevious: true,
    hasNext: true,
    backupOk: true,
    load: vi.fn(() => new Promise<Blob>(() => {})),
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    onClose: vi.fn(),
    onFavourite: vi.fn(),
    onDownload: vi.fn(),
    onDelete: vi.fn(),
    onAddToAlbum: vi.fn(),
    ...over,
  };
  render(<Viewer {...props} />);
  return props;
}

const details = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Details' }));
  return screen.getByRole('region', { name: 'Details' });
};

describe('Viewer', () => {
  it('heading says when it was taken', () => {
    show(photo('a', '2026-11-03T14:05:00Z'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'November 3, 2026, 9:05 AM',
    );
  });

  it('details: safe only when on the backup copy', () => {
    show(photo('a', '2026-11-03T14:05:00Z', { state: 'replicated' }, { size: 2_400_000 }));
    const d = details();
    expect(d).toHaveTextContent('a.jpg');
    expect(d).toHaveTextContent('2.4 MB');
    expect(d).toHaveTextContent('Safe: on your box and the backup copy');
  });

  it('details: pending until the backup copy has it', () => {
    show(photo('a', '2026-11-03T14:05:00Z', { state: 'verified' }));
    const d = details();
    expect(d).toHaveTextContent('On your box. Backup copy pending.');
    expect(d).not.toHaveTextContent(/Safe/);
  });

  it('details: never "Safe" while the backup copy is paused or the box is unknown', () => {
    show(photo('a', '2026-11-03T14:05:00Z', { state: 'replicated' }), { backupOk: false });
    expect(details()).not.toHaveTextContent(/Safe/);
  });

  it('a failed download says so, and Download is busy meanwhile', async () => {
    let fail!: (e: unknown) => void;
    show(photo('a', '2026-11-03T14:05:00Z'), {
      onDownload: vi.fn(() => new Promise<void>((_ok, no) => (fail = no))),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(screen.getByRole('button', { name: 'Downloading…' })).toBeDisabled();
    fail(new Error('x'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "The download didn't finish. Try again.",
    );
    expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled();
  });

  it('arrow keys move, Esc closes', () => {
    const p = show(photo('a', '2026-11-03T14:05:00Z'));
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(p.onNext).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(p.onPrevious).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(p.onClose).toHaveBeenCalled();
  });

  it('Previous is unavailable on the first photo', () => {
    const p = show(photo('a', '2026-11-03T14:05:00Z'), { hasPrevious: false });
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(p.onPrevious).not.toHaveBeenCalled();
  });

  it('Favourite is a toggle', () => {
    const p = show(photo('a', '2026-11-03T14:05:00Z', {}, { favourite: true }));
    const fav = screen.getByRole('button', { name: 'Favourite' });
    expect(fav).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(fav);
    expect(p.onFavourite).toHaveBeenCalledWith(false);
  });

  it('a video over 2 GiB is not played here: Download instead', () => {
    show(
      photo(
        'v',
        '2026-11-03T14:05:00Z',
        {
          blobs: { original: { id: 'o', size: 3 * 2 ** 30 } },
        },
        { mime: 'video/mp4' },
      ),
    );
    expect(screen.getByText(/too big to play here/)).toBeInTheDocument();
  });

  it('Delete asks to delete this photo', () => {
    const p = show(photo('a', '2026-11-03T14:05:00Z'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(p.onDelete).toHaveBeenCalled();
  });

  it('Add to album opens the picker, and its result is said politely', () => {
    const p = show(photo('a', '2026-11-03T14:05:00Z'), { said: 'Added to Garden' });
    fireEvent.click(screen.getByRole('button', { name: 'Add to album' }));
    expect(p.onAddToAlbum).toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Added to Garden');
  });

  it('opened inside an album, the button says Move to album', () => {
    const p = show(photo('a', '2026-11-03T14:05:00Z'), { inAlbum: true, said: 'Moved to Trips' });
    expect(screen.queryByRole('button', { name: 'Add to album' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Move to album' }));
    expect(p.onAddToAlbum).toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Moved to Trips');
  });

  it('Esc inside an open dialog does not close the viewer', () => {
    const p = show(photo('a', '2026-11-03T14:05:00Z'));
    const d = document.createElement('dialog');
    d.setAttribute('open', '');
    const b = document.createElement('button');
    d.appendChild(b);
    document.body.appendChild(d);
    fireEvent.keyDown(b, { key: 'Escape' });
    expect(p.onClose).not.toHaveBeenCalled();
    d.remove();
  });
});
