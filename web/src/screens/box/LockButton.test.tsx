import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LockButton } from './LockButton.tsx';

// Final review I4: Lock used to drop queued uploads without a word.
describe('LockButton', () => {
  it('locks straight away when nothing is uploading', () => {
    const onLock = vi.fn();
    render(<LockButton uploading={0} onLock={onLock} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
    expect(onLock).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks first while files are uploading; keeping on is the safe choice', () => {
    const onLock = vi.fn();
    render(<LockButton uploading={3} onLock={onLock} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
    expect(onLock).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'Lock while uploading?' });
    expect(dialog).toHaveTextContent(
      "3 files haven't finished uploading. Locking stops them, and you'll need to add them again.",
    );
    expect(screen.getByRole('button', { name: 'Keep uploading' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Keep uploading' }));
    expect(onLock).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lock anyway' }));
    expect(onLock).toHaveBeenCalledOnce();
  });

  it('one file reads as one file', () => {
    render(<LockButton uploading={1} onLock={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
    expect(screen.getByRole('dialog')).toHaveTextContent("1 file hasn't finished uploading.");
  });
});
