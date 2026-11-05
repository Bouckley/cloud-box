import type { DeviceView } from '@cloudbox/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DeviceList } from './Devices.tsx';

const NOW = new Date('2026-11-04T12:00:00Z');
const dev = (id: string, over: Partial<DeviceView> = {}): DeviceView => ({
  id,
  name: id,
  lastSeen: new Date('2026-11-04T11:55:00Z'),
  revokedAt: null,
  isThis: false,
  ...over,
});

function show(devices: DeviceView[]) {
  const props = {
    devices,
    now: NOW,
    onRename: vi.fn(() => Promise.resolve()),
    onRevoke: vi.fn(() => Promise.resolve()),
  };
  render(<DeviceList {...props} />);
  return props;
}

describe('DeviceList', () => {
  it('each device: its name (or Unnamed device), Last seen, and This browser', () => {
    show([dev('Laptop browser', { isThis: true }), dev('x', { name: null })]);
    const mine = screen.getByRole('listitem', { name: 'Laptop browser' });
    expect(mine).toHaveTextContent('This browser');
    expect(mine).toHaveTextContent('Last seen 5 min ago');
    expect(screen.getByRole('listitem', { name: 'Unnamed device' })).toBeInTheDocument();
  });

  it('Rename is offered for this browser only', () => {
    show([dev('Laptop browser', { isThis: true }), dev('Phone')]);
    expect(screen.getAllByRole('button', { name: /^Rename/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Rename Laptop browser' })).toBeInTheDocument();
  });

  it('the last device cannot be revoked, and it says why', () => {
    show([dev('Laptop browser', { isThis: true })]);
    const revoke = screen.getByRole('button', { name: 'Revoke Laptop browser' });
    expect(revoke).toBeDisabled();
    expect(revoke).toHaveAccessibleDescription(
      "It's the only device that can open your box. Add another first.",
    );
  });

  it('Revoke asks first, in the plan’s words, then removes', async () => {
    const p = show([dev('Laptop browser', { isThis: true }), dev('Phone')]);
    fireEvent.click(screen.getByRole('button', { name: 'Revoke Phone' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove Phone?' });
    expect(dialog).toHaveTextContent('It will need to be added again.');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(p.onRevoke).toHaveBeenCalledWith(expect.objectContaining({ id: 'Phone' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('revoked devices are not listed', () => {
    show([dev('Laptop browser', { isThis: true }), dev('Old', { revokedAt: NOW })]);
    expect(screen.queryByRole('listitem', { name: 'Old' })).toBeNull();
  });
});
