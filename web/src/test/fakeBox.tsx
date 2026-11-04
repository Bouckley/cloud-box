import type { Box, LibrarySnapshot, Unlocked } from '@cloudbox/core';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { vi } from 'vitest';
import { SessionProvider } from '../app/session.tsx';

const EMPTY: LibrarySnapshot = { collections: new Map(), items: new Map(), syncedAt: null };

/** An unlocked account that answers just enough for the shell. */
export function fakeUnlocked(): Unlocked {
  return {
    userId: 'u',
    deviceId: 'd',
    lock: vi.fn(),
    status: vi.fn(() => new Promise(() => {})),
    library: { subscribe: () => () => {}, snapshot: () => EMPTY },
  } as unknown as Unlocked;
}

export type FakeBox = { [K in keyof Box]?: Box[K] };

/** Renders one screen at `path` with a fake box, and a Photos page to land on. */
export function renderWithBox(
  box: FakeBox,
  path: string,
  element: ReactNode,
  extra: RouteObject[] = [],
) {
  const full = {
    info: vi.fn(async () => ({ setUp: true, setupOpen: false, version: 'test' })),
    login: vi.fn(async () => 'ok' as const),
    ...box,
  } as unknown as Box;
  const router = createMemoryRouter(
    [{ path, element }, { path: '/photos', element: <h1>Photos page</h1> }, ...extra],
    { initialEntries: [path] },
  );
  return {
    router,
    ...render(
      <SessionProvider box={full}>
        <RouterProvider router={router} />
      </SessionProvider>,
    ),
  };
}
