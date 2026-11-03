import { createBoxClient } from '@cloudbox/api-client';
import { BoxError, ClientError } from './errors.ts';

export type ApiClient = ReturnType<typeof createBoxClient>;
/** A client whose requests carry this device's session and log in again when it expires. */
export type AuthedClient = ApiClient;

/** Turns a network failure into ClientError('box_unreachable'). */
export function guardedFetch(fetchImpl: typeof fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      return await fetchImpl(input, init);
    } catch {
      throw new ClientError('box_unreachable');
    }
  }) as typeof fetch;
}

export type SessionSource = {
  token(): string | null;
  /** Logs in again; anything but 'ok' becomes the ClientError to throw. */
  relogin(): Promise<'ok' | 'not_paired' | 'revoked'>;
};

/**
 * Adds `Authorization` to every request. A 401 from anything but /v1/auth/*
 * is retried once with a copy of the request: with the current token if a
 * login already replaced the one that was sent, else after logging in again.
 */
export function authedFetch(fetchImpl: typeof fetch, session: SessionSource): typeof fetch {
  const guarded = guardedFetch(fetchImpl);
  const send = (req: Request, t: string | null) => {
    if (t === null) return guarded(req);
    const headers = new Headers(req.headers);
    headers.set('Authorization', `Bearer ${t}`);
    return guarded(new Request(req, { headers }));
  };
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const retry = req.clone();
    const sent = session.token();
    const res = await send(req, sent);
    if (res.status !== 401 || new URL(req.url).pathname.startsWith('/v1/auth/')) return res;
    const current = session.token();
    if (current !== null && current !== sent) return send(retry, current);
    const result = await session.relogin();
    if (result !== 'ok') throw new ClientError(result);
    return send(retry, session.token());
  }) as typeof fetch;
}

/** Returns the response data, or throws the box's error as a BoxError. */
export function must<T>(r: { data?: T; error?: unknown; response: Response }): T {
  if (!r.response.ok) throw new BoxError(r.response.status, r.error);
  return r.data as T;
}

export function b64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
