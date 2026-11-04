import type { Status } from '@cloudbox/core';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { SafetyBanner, type BannerInput } from './SafetyBanner.tsx';

const NOW = new Date('2026-11-03T15:00:00Z');

function status(over: Partial<Status> = {}, items: Partial<Status['items']> = {}): Status {
  return {
    safe: true,
    items: { total: 12, verified: 12, replicated: 12, notYetCopied: 0, trashed: 0, ...items },
    devices: [],
    drives: [
      { role: 'main', sizeBytes: 1e12, freeBytes: 6e11 },
      { role: 'backup', sizeBytes: 1e12, freeBytes: 6e11 },
    ],
    lastCopyAt: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
    warnings: [],
    ...over,
  };
}

function show(input: BannerInput, extra: { photoCount?: number; linkToBox?: boolean } = {}) {
  return render(
    <MemoryRouter>
      <SafetyBanner input={input} now={NOW} linkToBox={extra.linkToBox ?? true} {...extra} />
    </MemoryRouter>,
  );
}

const warning = (code: string) => ({ code, message: 'x', action: 'y' });

describe('SafetyBanner', () => {
  it('safe: says so, with when the backup copy last ran, politely', () => {
    show({ kind: 'status', status: status() });
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Everything is safe');
    expect(banner).toHaveTextContent('Backup copy updated 5 min ago');
  });

  it('safe on Photos: counts the photos', () => {
    show({ kind: 'status', status: status() }, { photoCount: 12480 });
    expect(screen.getByRole('status')).toHaveTextContent('All 12,480 photos are safe');
  });

  it('copying: names how many are waiting', () => {
    show({ kind: 'status', status: status({ safe: false }, { notYetCopied: 3, replicated: 9 }) });
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('3 waiting for the backup copy');
    expect(banner).toHaveTextContent("They're on your box. The backup copy runs every hour.");
    expect(banner).not.toHaveTextContent(/safe/i);
  });

  it('backup drive missing: an alert, and never "safe"', () => {
    show({
      kind: 'status',
      status: status({ safe: false, warnings: [warning('backup_missing')] }),
    });
    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('Backup copy paused');
    expect(banner).toHaveTextContent(
      "The backup drive isn't connected. Your photos are on the main drive only.",
    );
    expect(banner).not.toHaveTextContent(/is safe|are safe/);
  });

  it('backup missing wins even if the box still says safe', () => {
    show({ kind: 'status', status: status({ safe: true, warnings: [warning('backup_missing')] }) });
    expect(screen.getByRole('alert')).toHaveTextContent('Backup copy paused');
  });

  it('storage low: an alert', () => {
    show({ kind: 'status', status: status({ warnings: [warning('storage_low')] }) });
    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('Your box is almost full');
    expect(banner).toHaveTextContent('Free up space or add a drive soon.');
  });

  it('unreachable: an alert with what to check', () => {
    show({ kind: 'unreachable' });
    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent("Can't reach your box");
    expect(banner).toHaveTextContent(
      'Check the light on the front of the box is on, and that this computer is on your home network.',
    );
  });

  it('before the first status: checking, never safe', () => {
    show({ kind: 'checking' });
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Checking your box');
    expect(banner).not.toHaveTextContent(/safe/i);
  });

  it('links to Box, except on Box', () => {
    show({ kind: 'status', status: status() });
    expect(screen.getByRole('link', { name: /Everything is safe/ })).toHaveAttribute(
      'href',
      '/box',
    );
    show({ kind: 'status', status: status() }, { linkToBox: false });
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('shows an icon and words, never colour alone', () => {
    const { container } = show({ kind: 'unreachable' });
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });
});
