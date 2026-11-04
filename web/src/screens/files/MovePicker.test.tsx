import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { coll } from '../../test/photos.ts';
import { MovePicker } from './MovePicker.tsx';

const folders = [
  { folder: coll('files', 'folder', { name: 'Files', role: 'files' }), where: null },
  { folder: coll('taxes', 'folder', { name: 'Taxes' }), where: 'Files' },
  { folder: coll('y2025', 'folder', { name: '2025' }), where: 'Files › Taxes' },
];

function open(onMove = vi.fn(() => Promise.resolve())) {
  const onClose = vi.fn();
  render(
    <MovePicker
      name="Return.pdf"
      folders={folders}
      hereId="taxes"
      onMove={onMove}
      onClose={onClose}
    />,
  );
  return { onMove, onClose };
}

describe('MovePicker', () => {
  it('lists every folder with where it is; the one it is in now cannot be chosen', () => {
    open();
    expect(screen.getByRole('dialog', { name: 'Move "Return.pdf"' })).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Files' })).toHaveFocus();
    const here = screen.getByRole('radio', { name: 'Taxes' });
    expect(here).toBeDisabled();
    expect(here).toHaveAccessibleDescription("It's here now");
    expect(screen.getByRole('radio', { name: '2025' })).toHaveAccessibleDescription(
      'In Files › Taxes',
    );
  });

  it('moves to the chosen folder, then closes', async () => {
    const { onMove, onClose } = open();
    fireEvent.click(screen.getByRole('radio', { name: '2025' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    expect(onMove).toHaveBeenCalledWith('y2025');
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('says so when the move fails, and stays open', async () => {
    const { onClose } = open(vi.fn(() => Promise.reject(new Error('down'))));
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    expect(await screen.findByText("Couldn't move the file. Try again.")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
