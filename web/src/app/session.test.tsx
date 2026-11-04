import type { Status, Unlocked } from '@cloudbox/core';
import { act, render } from '@testing-library/react';
import { useEffect } from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeUnlocked } from '../test/fakeBox.tsx';
import { SessionProvider, STATUS_POLL_MS, useStatus, useUnlocked } from './session.tsx';

const STATUS = { safe: true, items: {}, devices: [], drives: [], lastCopyAt: null, warnings: [] };

function Grab({ on }: { on(r: (o?: { sync?: boolean }) => void): void }) {
  const { refresh } = useStatus();
  useEffect(() => on(refresh), [on, refresh]);
  return null;
}

function UnlockWith({ u }: { u: Unlocked }) {
  const { setUnlocked } = useUnlocked();
  useEffect(() => setUnlocked(u), [u, setUnlocked]);
  return null;
}

afterEach(() => vi.useRealTimers());

describe('status poll', () => {
  it('each poll also syncs the library, so photo states stay current', async () => {
    vi.useFakeTimers();
    const sync = vi.fn(async () => {});
    const u = fakeUnlocked();
    Object.assign(u, { status: vi.fn(async () => STATUS as unknown as Status) });
    Object.assign(u.library, { sync });
    const box = { info: vi.fn(() => new Promise(() => {})) };
    render(
      <SessionProvider box={box as never}>
        <UnlockWith u={u} />
      </SessionProvider>,
    );
    await act(async () => {});
    const first = sync.mock.calls.length;
    expect(first).toBeGreaterThanOrEqual(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STATUS_POLL_MS);
    });
    expect(sync.mock.calls.length).toBe(first + 1);
  });

  it('a refresh asked for during a poll runs after it, not dropped', async () => {
    let answer!: () => void;
    const status = vi.fn(
      () =>
        new Promise<Status>((ok) => {
          answer = () => ok(STATUS as unknown as Status);
        }),
    );
    const u = fakeUnlocked();
    Object.assign(u, { status });
    Object.assign(u.library, { sync: vi.fn(async () => {}) });
    let refresh!: (o?: { sync?: boolean }) => void;
    const grab = (r: typeof refresh) => {
      refresh = r;
    };
    render(
      <SessionProvider box={{ info: vi.fn(() => new Promise(() => {})) } as never}>
        <UnlockWith u={u} />
        <Grab on={grab} />
      </SessionProvider>,
    );
    await act(async () => {});
    expect(status).toHaveBeenCalledTimes(1);
    act(() => refresh({ sync: false }));
    expect(status).toHaveBeenCalledTimes(1);
    await act(async () => answer());
    expect(status).toHaveBeenCalledTimes(2);
  });
});
