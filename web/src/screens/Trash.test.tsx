import type { TrashView } from '@cloudbox/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { photo } from '../test/photos.ts';
import { TrashList } from './Trash.tsx';

const row = (id: string, daysLeft: number): TrashView => ({
  item: { ...photo(id, '2026-11-03T14:00:00Z'), trashedAt: new Date('2026-11-03T15:00:00Z') },
  daysLeft,
});

function show(items: TrashView[], over = {}) {
  const props = {
    items,
    onRestore: vi.fn(() => Promise.resolve()),
    onDeleteForever: vi.fn(() => Promise.resolve()),
    ...over,
  };
  render(<TrashList {...props} />);
  return props;
}

/** What a browser does when the focused button is disabled: focus leaves it. */
function dropFocus() {
  const away = document.createElement('input');
  document.body.append(away);
  away.focus();
  away.remove();
}

describe('TrashList', () => {
  it('lists each item with the days left', () => {
    show([row('a', 30), row('b', 1), row('c', 0)]);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('a.jpg');
    expect(items[0]).toHaveTextContent('30 days left');
    expect(items[1]).toHaveTextContent('1 day left');
    expect(items[2]).toHaveTextContent('Less than a day left');
  });

  it('empty Trash says so', () => {
    show([]);
    expect(screen.getByRole('heading', { name: 'Trash is empty' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Empty Trash' })).toBeNull();
  });

  it('Restore brings it back and says so', async () => {
    const p = show([row('a', 30)]);
    fireEvent.click(screen.getByRole('button', { name: 'Restore a.jpg' }));
    expect(p.onRestore).toHaveBeenCalledWith('a');
    expect(await screen.findByRole('status')).toHaveTextContent('Restored a.jpg');
  });

  it('Delete forever asks first; Cancel keeps it', () => {
    const p = show([row('a', 30)]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete forever a.jpg' }));
    const confirm = screen.getByRole('dialog', { name: "Delete forever? This can't be undone." });
    expect(within(confirm).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(p.onDeleteForever).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Delete forever, confirmed, deletes that item', async () => {
    const p = show([row('a', 30), row('b', 30)]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete forever a.jpg' }));
    const confirm = screen.getByRole('dialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete forever' }));
    expect(p.onDeleteForever).toHaveBeenCalledWith(['a']);
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('Empty Trash names the count and deletes everything once confirmed', () => {
    const p = show([row('a', 30), row('b', 2), row('c', 9)]);
    fireEvent.click(screen.getByRole('button', { name: 'Empty Trash' }));
    const confirm = screen.getByRole('dialog', { name: 'Empty Trash?' });
    expect(confirm).toHaveTextContent("Delete 3 items forever? This can't be undone.");
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete forever' }));
    expect(p.onDeleteForever).toHaveBeenCalledWith(['a', 'b', 'c']);
  });

  it('a failed Delete forever closes the confirm and says so on the page', async () => {
    show([row('a', 30)], { onDeleteForever: vi.fn(() => Promise.reject(new Error('x'))) });
    fireEvent.click(screen.getByRole('button', { name: 'Delete forever a.jpg' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete forever' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't delete a.jpg forever. Try again.",
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('after Restore, focus goes to the next row', async () => {
    show([row('a', 30), row('b', 30)]);
    fireEvent.click(screen.getByRole('button', { name: 'Restore a.jpg' }));
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Restore b.jpg' })).toHaveFocus(),
    );
  });

  it('a permanent delete clears an earlier "Restored" line', async () => {
    show([row('a', 30), row('b', 30)]);
    fireEvent.click(screen.getByRole('button', { name: 'Restore a.jpg' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Restored a.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'Delete forever b.jpg' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete forever' }),
    );
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('a failed Restore puts focus back on that Restore button', async () => {
    show([row('a', 30), row('b', 30)], { onRestore: vi.fn(() => Promise.reject(new Error('x'))) });
    const btn = screen.getByRole('button', { name: 'Restore a.jpg' });
    btn.focus();
    fireEvent.click(btn);
    // Browsers drop focus from a button that becomes disabled; jsdom does not.
    dropFocus();
    expect(btn).not.toHaveFocus();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't restore a.jpg. Try again.",
    );
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Restore a.jpg' })).toHaveFocus(),
    );
  });

  it('Empty Trash is marked as the dangerous action it is', () => {
    show([row('a', 30)]);
    expect(screen.getByRole('button', { name: 'Empty Trash' })).toHaveClass('button--quiet-danger');
  });
});
