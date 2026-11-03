import { describe, expect, it } from 'vitest';
import { authedFetch } from '../src/transport.ts';

describe('authedFetch', () => {
  it('a late 401 for an old token retries with the new one, without a second login', async () => {
    let token = 'old'; // already expired on the box
    let logins = 0;
    let login: Promise<'ok'> | null = null;
    const box = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      const ok = req.headers.get('Authorization') === `Bearer ${token}` && token !== 'old';
      // The slow request's 401 arrives after the first re-login has finished.
      if (new URL(req.url).pathname === '/v1/slow') await new Promise((r) => setTimeout(r, 30));
      return new Response(null, { status: ok ? 200 : 401 });
    }) as typeof fetch;
    const session = {
      token: () => token,
      relogin: () =>
        (login ??= (async () => {
          logins++;
          await new Promise((r) => setTimeout(r, 5));
          token = `new${logins}`;
          login = null;
          return 'ok' as const;
        })()),
    };
    const f = authedFetch(box, session);
    const results = await Promise.all([f('https://box/v1/status'), f('https://box/v1/slow')]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(logins).toBe(1);
  });

  it('a 401 from /v1/auth is returned as is', async () => {
    const f = authedFetch((async () => new Response(null, { status: 401 })) as typeof fetch, {
      token: () => 't',
      relogin: async () => {
        throw new Error('must not log in');
      },
    });
    expect((await f('https://box/v1/auth/verify', { method: 'POST' })).status).toBe(401);
  });
});
