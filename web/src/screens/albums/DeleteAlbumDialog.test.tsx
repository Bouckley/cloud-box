import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DeleteAlbumDialog } from './DeleteAlbumDialog.tsx';

function open(over: Partial<Parameters<typeof DeleteAlbumDialog>[0]> = {}) {
  const props = {
    name: 'Garden',
    count: 2,
    onConfirm: vi.fn(() => Promise.resolve()),
    onClose: vi.fn(),
    ...over,
  };
  render(<DeleteAlbumDialog {...props} />);
  return props;
}

describe('DeleteAlbumDialog', () => {
  it('keeps the photos by default, says where they go, and starts on Cancel', () => {
    open();
    const dialog = screen.getByRole('dialog', { name: 'Delete "Garden"?' });
    const keep = screen.getByRole('radio', { name: 'Keep the photos' });
    expect(keep).toBeChecked();
    expect(keep).toHaveAccessibleDescription('They move back to Photos.');
    expect(screen.getByRole('radio', { name: 'Move the photos to Trash' })).not.toBeChecked();
    expect(
      screen.getByRole('radio', { name: 'Move the photos to Trash' }),
    ).toHaveAccessibleDescription('You can restore them from Trash for 30 days.');
    expect(dialog).toContainElement(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('Delete album keeps the photos unless Trash was chosen', async () => {
    const p = open();
    fireEvent.click(screen.getByRole('button', { name: 'Delete album' }));
    expect(p.onConfirm).toHaveBeenCalledWith('keep');
    await vi.waitFor(() => expect(p.onClose).toHaveBeenCalled());
  });

  it('can move the photos to Trash instead', () => {
    const p = open();
    fireEvent.click(screen.getByRole('radio', { name: 'Move the photos to Trash' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete album' }));
    expect(p.onConfirm).toHaveBeenCalledWith('trash');
  });

  it('one photo is spoken of as one', () => {
    open({ count: 1 });
    expect(screen.getByRole('radio', { name: 'Keep the photo' })).toHaveAccessibleDescription(
      'It moves back to Photos.',
    );
    expect(screen.getByRole('radio', { name: 'Move the photo to Trash' })).toBeInTheDocument();
  });

  it('an empty album has nothing to choose', () => {
    const p = open({ count: 0 });
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByRole('dialog')).toHaveTextContent('There are no photos in it.');
    fireEvent.click(screen.getByRole('button', { name: 'Delete album' }));
    expect(p.onConfirm).toHaveBeenCalledWith('keep');
  });

  it('a failure says so and stays open', async () => {
    const p = open({ onConfirm: vi.fn(() => Promise.reject(new Error('x'))) });
    fireEvent.click(screen.getByRole('button', { name: 'Delete album' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't delete the album. Try again.",
    );
    expect(p.onClose).not.toHaveBeenCalled();
  });
});
