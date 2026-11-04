import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NewFolderDialog } from './NewFolderDialog.tsx';

describe('NewFolderDialog', () => {
  it('names a new folder in the folder’s own words', async () => {
    const onSave = vi.fn(() => Promise.reject(new Error('down')));
    render(<NewFolderDialog onSave={onSave} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'New folder' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Give the folder a name.');
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Taxes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onSave).toHaveBeenCalledWith('Taxes');
    expect(await screen.findByText("Couldn't create the folder. Try again.")).toBeInTheDocument();
  });

  it('renames a folder', () => {
    render(<NewFolderDialog current="Taxes" onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Rename folder' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Taxes');
  });
});
