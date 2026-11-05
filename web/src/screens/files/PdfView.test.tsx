import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PdfDoc } from '../../app/pdf.ts';
import { PdfView } from './PdfView.tsx';

function fakeDoc(pages = 3, draw: () => Promise<boolean> = () => Promise.resolve(true)): PdfDoc {
  return {
    pages,
    page: vi.fn((n: number) =>
      Promise.resolve({
        width: 595,
        height: 842,
        render: vi.fn(draw),
        text: () => Promise.resolve(`Words on page ${n}`),
      }),
    ),
    destroy: vi.fn(),
  };
}

describe('PdfView', () => {
  it('a toolbar of page and zoom controls, every one labelled', async () => {
    render(<PdfView doc={fakeDoc()} name="Will.pdf" />);
    const bar = screen.getByRole('toolbar', { name: 'Pages and zoom' });
    expect(bar).toHaveTextContent('Page 1 of 3');
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fit width' })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Pages of Will.pdf' })).toBeInTheDocument();
  });

  it('Next and Previous move a page at a time', () => {
    render(<PdfView doc={fakeDoc()} name="Will.pdf" />);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByRole('toolbar')).toHaveTextContent('Page 2 of 3');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(screen.getByRole('toolbar')).toHaveTextContent('Page 2 of 3');
  });

  it('zooms in and out in steps, and says the size', async () => {
    render(<PdfView doc={fakeDoc()} name="Will.pdf" />);
    const status = await screen.findByText(/^\d+%$/);
    const before = Number.parseInt(status.textContent ?? '', 10);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(Number.parseInt(status.textContent ?? '', 10)).toBeGreaterThan(before);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(Number.parseInt(status.textContent ?? '', 10)).toBeLessThan(before);
  });

  it('a screen reader gets each page’s words, not a blank picture', async () => {
    render(<PdfView doc={fakeDoc(1)} name="Will.pdf" />);
    const page = await screen.findByRole('group', { name: 'Page 1 of 1' });
    expect(await screen.findByText('Words on page 1')).toBeInTheDocument();
    expect(page.querySelector('canvas')).toHaveAttribute('aria-hidden', 'true');
  });

  it("a page that can't be drawn says so, and how to see it", async () => {
    render(
      <PdfView doc={fakeDoc(1, () => Promise.reject(new Error('bad font')))} name="Will.pdf" />,
    );
    const page = await screen.findByRole('group', { name: 'Page 1 of 1' });
    expect(
      await within(page).findByText("This page couldn't be shown. Download the file to see it."),
    ).toBeVisible();
  });

  it('a draw replaced by a newer one (zoom) is not a failure', async () => {
    render(<PdfView doc={fakeDoc(1, () => Promise.resolve(false))} name="Will.pdf" />);
    const page = await screen.findByRole('group', { name: 'Page 1 of 1' });
    await within(page).findByText('Words on page 1');
    expect(within(page).queryByText(/couldn't be shown/)).toBeNull();
  });
});
