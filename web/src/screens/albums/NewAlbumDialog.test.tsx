import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NewAlbumDialog } from './NewAlbumDialog.tsx';

function open(over: Partial<Parameters<typeof NewAlbumDialog>[0]> = {}) {
  const props = { onSave: vi.fn(() => Promise.resolve()), onClose: vi.fn(), ...over };
  render(<NewAlbumDialog {...props} />);
  return props;
}

describe('NewAlbumDialog', () => {
  it('asks for a name, starting in the field', () => {
    open();
    expect(screen.getByRole('dialog', { name: 'New album' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  });

  it('an empty name says what to do and saves nothing', () => {
    const p = open();
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Give the album a name.');
    expect(p.onSave).not.toHaveBeenCalled();
  });

  it('saves the trimmed name, then closes', async () => {
    const p = open();
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: '  Garden ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(p.onSave).toHaveBeenCalledWith('Garden');
    await vi.waitFor(() => expect(p.onClose).toHaveBeenCalled());
  });

  it('Rename starts with the current name', () => {
    open({ current: 'Garden' });
    expect(screen.getByRole('dialog', { name: 'Rename album' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Garden');
    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
  });

  it('a failure says so and stays open', async () => {
    const p = open({ onSave: vi.fn(() => Promise.reject(new Error('x'))) });
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't create the album. Try again.",
    );
    expect(p.onClose).not.toHaveBeenCalled();
  });
});
