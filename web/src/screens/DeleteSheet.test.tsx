import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DeleteSheet } from './DeleteSheet.tsx';

function open(over: Partial<Parameters<typeof DeleteSheet>[0]> = {}) {
  const props = {
    what: 'photo' as const,
    count: 1,
    onConfirm: vi.fn(() => Promise.resolve()),
    onClose: vi.fn(),
    ...over,
  };
  render(<DeleteSheet {...props} />);
  return props;
}

/** What a browser does when the focused button is disabled: focus leaves it. */
function dropFocus() {
  const away = document.createElement('input');
  document.body.append(away);
  away.focus();
  away.remove();
}

describe('DeleteSheet', () => {
  it('says the photo stays safe until you choose, and starts on Cancel', () => {
    open();
    const sheet = screen.getByRole('dialog', { name: 'Delete this photo?' });
    expect(sheet).toHaveTextContent('It stays safe on your box until you choose.');
    expect(sheet).toHaveTextContent('You can restore it from Trash for 30 days.');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('names how many photos, or a file', () => {
    open({ count: 3 });
    expect(screen.getByRole('dialog', { name: 'Delete 3 photos?' })).toBeInTheDocument();
  });

  it('a file says so', () => {
    open({ what: 'file' });
    expect(screen.getByRole('dialog', { name: 'Delete this file?' })).toBeInTheDocument();
  });

  it('Esc and Cancel close it without moving anything', () => {
    const p = open();
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(p.onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(p.onClose).toHaveBeenCalledTimes(2);
    expect(p.onConfirm).not.toHaveBeenCalled();
  });

  it('Move to Trash is busy while it works, then closes', async () => {
    let done!: () => void;
    const p = open({ onConfirm: vi.fn(() => new Promise<void>((r) => (done = r))) });
    fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }));
    expect(screen.getByRole('button', { name: 'Moving to Trash…' })).toBeDisabled();
    done();
    await vi.waitFor(() => expect(p.onClose).toHaveBeenCalled());
  });

  it('a failure says so and stays open', async () => {
    const p = open({ onConfirm: vi.fn(() => Promise.reject(new Error('x'))) });
    fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't move it to Trash. Try again.",
    );
    expect(p.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Move to Trash' })).toBeEnabled();
  });

  it('after a failed move, focus goes back to Move to Trash', async () => {
    open({ onConfirm: vi.fn(() => Promise.reject(new Error('x'))) });
    const move = screen.getByRole('button', { name: 'Move to Trash' });
    move.focus();
    fireEvent.click(move);
    // Browsers drop focus from a button that becomes disabled; jsdom does not.
    dropFocus();
    expect(move).not.toHaveFocus();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't move it to Trash. Try again.",
    );
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Move to Trash' })).toHaveFocus(),
    );
  });
});
