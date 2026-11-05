import type { Status } from '@cloudbox/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Copies } from './Copies.tsx';

const NOW = new Date('2026-11-04T12:00:00Z');
const TB = 1e12;

function status(over: Partial<Status> = {}): Status {
  return {
    safe: true,
    items: { total: 3, verified: 3, replicated: 3, notYetCopied: 0, trashed: 0 },
    devices: [],
    drives: [
      { role: 'main', sizeBytes: TB, freeBytes: TB / 2 },
      { role: 'backup', sizeBytes: TB, freeBytes: TB / 2 },
    ],
    lastCopyAt: '2026-11-04T11:55:00Z',
    warnings: [],
    ...over,
  };
}

const row = (name: string) => screen.getByRole('listitem', { name });

describe('Copies', () => {
  it('main drive Connected, backup copy Updated {time}', () => {
    render(<Copies status={status()} now={NOW} />);
    expect(row('Main drive')).toHaveTextContent('Connected');
    expect(row('Backup copy')).toHaveTextContent('Updated 5 min ago');
  });

  it('backup drive missing: Not connected, with an icon and words', () => {
    render(
      <Copies
        status={status({
          safe: false,
          drives: [{ role: 'main', sizeBytes: TB, freeBytes: TB / 2 }],
          warnings: [{ code: 'backup_missing', message: 'x', action: 'y' }],
        })}
        now={NOW}
      />,
    );
    const backup = row('Backup copy');
    expect(backup).toHaveTextContent('Not connected');
    expect(backup).toHaveAttribute('data-tone', 'attention');
    expect(within(backup).getByRole('img', { name: 'Needs attention' })).toBeInTheDocument();
  });

  it('a backup drive that has never been copied to: Not copied yet', () => {
    render(<Copies status={status({ safe: false, lastCopyAt: null })} now={NOW} />);
    expect(row('Backup copy')).toHaveTextContent('Not copied yet');
  });

  it('never says Healthy, in any state', () => {
    const { container } = render(<Copies status={status()} now={NOW} />);
    expect(container).not.toHaveTextContent(/healthy/i);
  });

  it('before the first answer it waits quietly', () => {
    render(<Copies status={null} now={NOW} />);
    expect(screen.getByText('Checking your box…')).toBeInTheDocument();
  });
});
