import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SimPage } from './SimPage.tsx';

const TB = 1e12;
type Drive = { role: string; sizeBytes: number; freeBytes: number };

/** A fake simulated box behind fetch, answering like box/internal/api/devsim.go. */
function fakeBox() {
  const st = {
    light: 'off',
    clockOffsetSeconds: 0,
    backup: true,
    drives: {
      main: { role: 'main', sizeBytes: TB, freeBytes: 0.9 * TB },
      backup: { role: 'backup', sizeBytes: 2 * TB, freeBytes: 1.8 * TB },
    } as Record<string, Drive>,
  };
  const state = () => ({
    light: st.light,
    clockOffsetSeconds: st.clockOffsetSeconds,
    drives: st.backup ? [st.drives.main, st.drives.backup] : [st.drives.main],
  });
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  return vi.fn(async (path: string, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    if (path === '/dev/sim/state') return json(200, state());
    if (path === '/dev/sim/drives/backup') {
      st.backup = body.present as boolean;
      return json(200, state());
    }
    if (path === '/dev/sim/drives/main') {
      const main = st.drives.main!;
      main.freeBytes = TB * (1 - (body.fillPercent as number) / 100);
      return json(200, state());
    }
    if (path === '/dev/sim/clock/advance') {
      st.clockOffsetSeconds += body.seconds as number;
      return json(200, state());
    }
    if (path === '/dev/sim/button') return json(200, { pressed: body.kind });
    if (path === '/dev/sim/jobs/replicate' && !st.backup) {
      return json(409, {
        code: 'job_failed',
        message: 'backup drive missing',
        action: 'See the boxd log.',
      });
    }
    if (path === '/dev/sim/jobs/light') {
      st.light = 'attention';
      return json(200, { light: 'attention' });
    }
    return json(200, {});
  });
}

function show() {
  render(
    <MemoryRouter>
      <SimPage />
    </MemoryRouter>,
  );
  return screen.getByRole('region', { name: 'The simulated box now' });
}

describe('SimPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fakeBox());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the simulated box in words as soon as it opens', async () => {
    const now = show();
    expect(await within(now).findByText('Plugged in, 10% full')).toBeInTheDocument();
    expect(within(now).getByText('10% full')).toBeInTheDocument();
    expect(within(now).getByText('Off')).toBeInTheDocument();
    expect(within(now).getByText('Real time')).toBeInTheDocument();
  });

  it('a press changes what the page shows, and says what happened', async () => {
    const user = userEvent.setup();
    const now = show();
    await within(now).findByText('Plugged in, 10% full');
    await user.click(screen.getByRole('button', { name: 'Unplug backup' }));
    expect(await within(now).findByText('Unplugged')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Last action' })).toHaveTextContent(
      'Unplug backup: done',
    );

    await user.click(screen.getByRole('button', { name: 'Advance clock' }));
    expect(await within(now).findByText('1 h ahead')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Run light' }));
    expect(await within(now).findByText('Attention')).toBeInTheDocument();
  });

  it('a refused action shows the box’s reason', async () => {
    const user = userEvent.setup();
    const now = show();
    await within(now).findByText('Plugged in, 10% full');
    await user.click(screen.getByRole('button', { name: 'Unplug backup' }));
    await within(now).findByText('Unplugged');
    await user.click(screen.getByRole('button', { name: 'Run replicate' }));
    expect(await screen.findByText('Run replicate: backup drive missing')).toBeInTheDocument();
  });

  it('says so when the box does not answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    show();
    expect(await screen.findByText(/The box did not answer/)).toBeInTheDocument();
  });

  it('explains why the banner above does not change yet', () => {
    show();
    expect(screen.getByText(/banner .* only once this browser is signed in/i)).toBeInTheDocument();
  });
});
