import type { ItemView } from '@cloudbox/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_IN_MEMORY } from '../../app/download.ts';
import { photo } from '../../test/photos.ts';
import { FileViewer, type FileViewerProps } from './FileViewer.tsx';

const pdf = photo(
  'f1',
  null,
  { collectionId: 'taxes', blobs: { original: { size: 1_400_000 } } as ItemView['blobs'] },
  { name: 'Return 2025.pdf', mime: 'application/pdf', size: 1_400_000 },
);
const jpg = photo(
  'p1',
  null,
  {
    collectionId: 'files',
    blobs: { original: { size: 2_000_000 }, preview: { size: 200_000 } } as ItemView['blobs'],
  },
  { name: 'Passport scan.jpg' },
);

function show(item: ItemView, over: Partial<FileViewerProps> = {}) {
  const props: FileViewerProps = {
    item,
    where: 'Files › Taxes',
    load: vi.fn(() => Promise.resolve(new Blob(['x']))),
    onClose: vi.fn(),
    onDownload: vi.fn(() => Promise.resolve()),
    onMove: vi.fn(),
    onDelete: vi.fn(),
    ...over,
  };
  render(<FileViewer {...props} />);
  return props;
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:shown');
  URL.revokeObjectURL = vi.fn();
});

describe('FileViewer', () => {
  it('shows a PDF inside the app, named by the file, with where it lives', async () => {
    const p = show(pdf);
    expect(screen.getByRole('heading', { level: 1, name: 'Return 2025.pdf' })).toBeInTheDocument();
    expect(screen.getByText('In Files › Taxes · 1.4 MB')).toBeInTheDocument();
    const frame = await screen.findByTitle('Return 2025.pdf');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('src', 'blob:shown');
    expect(p.load).toHaveBeenCalledWith(pdf, 'original', expect.any(AbortSignal));
  });

  it('shows a photo from its smaller preview', async () => {
    const p = show(jpg);
    expect(await screen.findByRole('img', { name: 'Passport scan.jpg' })).toHaveAttribute(
      'src',
      'blob:shown',
    );
    expect(p.load).toHaveBeenCalledWith(jpg, 'preview', expect.any(AbortSignal));
  });

  it('a file too big to hold here says to download it, and loads nothing', () => {
    const big = { ...pdf, blobs: { original: { size: MAX_IN_MEMORY + 1 } } } as ItemView;
    const p = show(big);
    expect(
      screen.getByText('This file is too big to show here. Download it to open it.'),
    ).toBeInTheDocument();
    expect(p.load).not.toHaveBeenCalled();
  });

  it('a browser with no PDF reader (Android) offers Download instead of a blank frame', () => {
    Object.defineProperty(navigator, 'pdfViewerEnabled', { value: false, configurable: true });
    try {
      const p = show(pdf);
      expect(
        screen.getByText("This can't be shown here. Download it to open it."),
      ).toBeInTheDocument();
      expect(screen.queryByTitle('Return 2025.pdf')).toBeNull();
      expect(p.load).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(navigator, 'pdfViewerEnabled', { value: true, configurable: true });
    }
  });

  it('Close, Esc, Download, Move to… and Delete do what they say', () => {
    const p = show(pdf);
    fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));
    expect(p.onMove).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(p.onDelete).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(p.onDownload).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(p.onClose).toHaveBeenCalledTimes(2);
  });
});
