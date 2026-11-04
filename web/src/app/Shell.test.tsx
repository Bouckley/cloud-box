import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { Shell, type ShellProps } from './Shell.tsx';

function at(path: string, props: Partial<ShellProps> = {}) {
  const shell = (
    <Shell
      banner={{ kind: 'checking' }}
      storage={{ usedBytes: 412e9, sizeBytes: 1e12 }}
      photoCount={null}
      {...props}
    />
  );
  const router = createMemoryRouter(
    [
      {
        element: shell,
        children: ['photos', 'albums', 'files', 'box', 'trash'].map((p) => ({
          path: `/${p}`,
          element: <h1>{p}</h1>,
        })),
      },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

describe('Shell', () => {
  it('nav links have names and the active one is marked', () => {
    at('/albums');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    for (const name of ['Photos', 'Albums', 'Files', 'Box']) {
      expect(within(nav).getByRole('link', { name })).toBeInTheDocument();
    }
    expect(within(nav).getByRole('link', { name: 'Albums' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Photos' })).not.toHaveAttribute('aria-current');
  });

  it('Trash lives under Albums: Albums stays marked there', () => {
    at('/trash');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Albums' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('a skip link leads to main, and the banner comes first in main', () => {
    at('/photos');
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    const main = screen.getByRole('main');
    expect(skip).toHaveAttribute('href', `#${main.id}`);
    expect(main.firstElementChild).toHaveAttribute('data-banner');
    expect(within(main).getByRole('heading', { level: 1 })).toHaveTextContent('photos');
  });

  it('the Box link says when it needs attention', () => {
    at('/photos', { banner: { kind: 'unreachable' } });
    expect(screen.getByRole('link', { name: 'Box, needs attention' })).toBeInTheDocument();
  });

  it('shows storage used, and hides it when unknown', () => {
    at('/photos');
    expect(screen.getByText('412 GB of 1 TB used')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '41 percent of storage used' })).toBeInTheDocument();
  });

  it('hides storage when unknown', () => {
    at('/photos', { storage: null });
    expect(screen.queryByText(/ used$/)).toBeNull();
  });

  it('the banner is plain text on Box', () => {
    at('/box', {
      banner: {
        kind: 'status',
        status: {
          safe: true,
          items: { total: 0, verified: 0, replicated: 0, notYetCopied: 0, trashed: 0 },
          devices: [],
          drives: [],
          lastCopyAt: null,
          warnings: [],
        },
      },
    });
    const main = screen.getByRole('main');
    expect(within(main).queryByRole('link')).toBeNull();
  });
});
