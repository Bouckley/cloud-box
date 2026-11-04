import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UploadPanel } from './UploadPanel.tsx';
import type { UploadState } from './uploads.ts';

const base: UploadState = {
  total: 3,
  done: 1,
  queued: 1,
  current: { name: 'beach.jpg', sent: 4, total: 8 },
  duplicates: [],
  failed: [],
};

function show(state: Partial<UploadState> = {}) {
  const on = {
    onRetry: vi.fn(),
    onRestore: vi.fn<(id: string) => Promise<void>>(async () => {}),
    onClose: vi.fn(),
  };
  render(
    <UploadPanel
      state={{ ...base, ...state }}
      busy={'current' in state ? !!state.current : true}
      {...on}
    />,
  );
  return on;
}

describe('UploadPanel', () => {
  it('says which file of how many, with progress named by the file', () => {
    show();
    expect(screen.getByRole('heading', { name: 'Uploading 2 of 3' })).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: 'beach.jpg' });
    expect(bar).toHaveAttribute('value', '4');
    expect(bar).toHaveAttribute('max', '8');
    // No closing while files are still going up.
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('lists duplicates: already on the box, or in Trash with Restore', () => {
    const on = show({
      current: null,
      queued: 0,
      done: 3,
      duplicates: [
        { name: 'a.jpg', itemId: 'A', trashed: false },
        { name: 'b.jpg', itemId: 'B', trashed: true },
      ],
    });
    const list = screen.getByRole('list', { name: 'Results' });
    const [a, b] = within(list).getAllByRole('listitem');
    expect(a).toHaveTextContent('a.jpg');
    expect(a).toHaveTextContent('Already on your box');
    expect(b).toHaveTextContent('In Trash');
    fireEvent.click(within(b!).getByRole('button', { name: 'Restore b.jpg' }));
    expect(on.onRestore).toHaveBeenCalledWith('B');
  });

  it('lists failures with the reason and Try again', () => {
    const on = show({
      current: null,
      queued: 0,
      failed: [{ id: 7, name: 'c.jpg', error: new Error('x') }],
    });
    const row = screen.getByRole('listitem');
    expect(row).toHaveTextContent('c.jpg');
    expect(row).toHaveTextContent('Something went wrong. Try again.');
    fireEvent.click(within(row).getByRole('button', { name: 'Try again c.jpg' }));
    expect(on.onRetry).toHaveBeenCalledWith(7);
  });

  it('stays until closed', () => {
    const on = show({ current: null, queued: 0, done: 3 });
    expect(screen.getByRole('heading', { name: 'Upload finished' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(on.onClose).toHaveBeenCalled();
  });

  it('counts a failed file as gone through', () => {
    show({ done: 0, failed: [{ id: 1, name: 'x.jpg', error: new Error('x') }] });
    expect(screen.getByRole('heading', { name: 'Uploading 2 of 3' })).toBeInTheDocument();
  });

  it('Restore is busy while it runs and says if it failed', async () => {
    let fail!: (e: unknown) => void;
    const on = { onRetry: vi.fn(), onClose: vi.fn() };
    const onRestore = vi.fn(() => new Promise<void>((_ok, no) => (fail = no)));
    render(
      <UploadPanel
        state={{
          ...base,
          current: null,
          queued: 0,
          duplicates: [{ name: 'b.jpg', itemId: 'B', trashed: true }],
        }}
        busy={false}
        onRestore={onRestore}
        {...on}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Restore b.jpg' }));
    expect(screen.getByRole('button', { name: 'Restore b.jpg' })).toBeDisabled();
    fail(new Error('x'));
    expect(await screen.findByText("Couldn't restore it. Try again.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore b.jpg' })).toBeEnabled();
  });
});
