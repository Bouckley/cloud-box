import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { coll } from '../../test/photos.ts';
import { UploadSheet } from './UploadSheet.tsx';

const folders = [
  { folder: coll('files', 'folder', { name: 'Files', role: 'files' }), where: null },
  { folder: coll('taxes', 'folder', { name: 'Taxes' }), where: 'Files' },
];

describe('UploadSheet', () => {
  it('says where it saves, lets you change it, and hands over the chosen files', () => {
    const onChoose = vi.fn();
    const onClose = vi.fn();
    render(
      <UploadSheet folders={folders} folderId="taxes" onChoose={onChoose} onClose={onClose} />,
    );
    expect(screen.getByRole('dialog', { name: 'Upload' })).toBeInTheDocument();
    expect(screen.getByText('Saving to Files › Taxes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByRole('radio', { name: 'Taxes' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Files' }));
    expect(screen.getByText('Saving to Files')).toBeInTheDocument();

    const input = screen.getByLabelText('Choose files');
    expect(input).toHaveAttribute('multiple');
    const file = new File(['x'], 'Return.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onChoose).toHaveBeenCalledWith([file], 'files');
    expect(onClose).toHaveBeenCalled();
  });

  it('choosing nothing keeps it open', () => {
    const onChoose = vi.fn();
    render(
      <UploadSheet folders={folders} folderId="files" onChoose={onChoose} onClose={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Choose files'), { target: { files: [] } });
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('a folder it can’t name is never the quiet destination', () => {
    const onChoose = vi.fn();
    render(
      <UploadSheet folders={folders} folderId="secret" onChoose={onChoose} onClose={vi.fn()} />,
    );
    expect(screen.getByText('Saving to Files')).toBeInTheDocument();
    const file = new File(['x'], 'a.pdf');
    fireEvent.change(screen.getByLabelText('Choose files'), { target: { files: [file] } });
    expect(onChoose).toHaveBeenCalledWith([file], 'files');
  });
});
