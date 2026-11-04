import type { ItemView } from '@cloudbox/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { photo } from '../../test/photos.ts';
import { FileDetails } from './FileDetails.tsx';

const deb = photo(
  'd1',
  null,
  { collectionId: 'files', blobs: { original: { size: 48_000_000 } } as ItemView['blobs'] },
  {
    name: 'printer-driver.deb',
    mime: 'application/vnd.debian.binary-package',
    size: 48_000_000,
    modifiedAt: '2026-10-03T10:00:00Z',
  },
);

describe('FileDetails', () => {
  it('names the file and what it is; nothing downloads until Download', () => {
    const p = {
      item: deb,
      where: 'Files',
      onDownload: vi.fn(() => Promise.resolve()),
      onMove: vi.fn(),
      onDelete: vi.fn(),
      onClose: vi.fn(),
    };
    render(<FileDetails {...p} />);
    const sheet = screen.getByRole('dialog', { name: 'printer-driver.deb' });
    expect(sheet).toHaveTextContent("This can't be shown here. Download it to open it.");
    expect(sheet).toHaveTextContent('48 MB');
    expect(sheet).toHaveTextContent('In Files');
    expect(p.onDownload).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(p.onDownload).toHaveBeenCalled();
  });

  it('one big Download, then Move to… and Delete as a list; Close is the × at the top', () => {
    render(
      <FileDetails
        item={deb}
        where="Files"
        onDownload={vi.fn(() => Promise.resolve())}
        onMove={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const list = screen.getByRole('list', { name: 'More for this file' });
    expect(
      within(list)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Move to…', 'Delete']);
    expect(screen.getByRole('button', { name: 'Download' })).toHaveClass('button--primary');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('icon-button');
  });

  it('Move to… and Delete hand over to their own dialogs', () => {
    const p = {
      item: deb,
      where: 'Files',
      onDownload: vi.fn(() => Promise.resolve()),
      onMove: vi.fn(),
      onDelete: vi.fn(),
      onClose: vi.fn(),
    };
    render(<FileDetails {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));
    expect(p.onMove).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(p.onDelete).toHaveBeenCalled();
  });
});
