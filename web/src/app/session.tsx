import {
  Box,
  ClientError,
  type Library,
  type LibrarySnapshot,
  type Platform,
  type Status,
  type Unlocked,
} from '@cloudbox/core';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { deriveKekInWorker } from '../platform/kdf.ts';
import { idbStore } from '../platform/idbStore.ts';
import type { BannerInput } from './SafetyBanner.tsx';

/** Where a fresh page load should go, from `info()` and `login()`. */
export type Entry =
  | { kind: 'loading' }
  | { kind: 'setup' }
  | { kind: 'connect'; revoked: boolean }
  | { kind: 'unlock' }
  | { kind: 'unreachable' };

type SessionValue = {
  box: Box;
  entry: Entry;
  recheck(): void;
  unlocked: Unlocked | null;
  /** Called by the setup, unlock and connect flows; null locks. */
  setUnlocked(u: Unlocked | null): void;
  banner: BannerInput;
  status: Status | null;
  /** Asks the box for its status now; `sync: false` skips the library sync. */
  refreshStatus(o?: { sync?: boolean }): void;
};

const SessionContext = createContext<SessionValue | null>(null);

export const STATUS_POLL_MS = 30_000;

export function browserPlatform(): Platform {
  return { fetch: window.fetch.bind(window), store: idbStore(), deriveKek: deriveKekInWorker };
}

/**
 * Holds the one Box connection for this tab, where a new page load should go,
 * the unlocked account (in memory only: a reload asks for the password again),
 * and the box's status, polled every 30 s while the tab is visible.
 */
export function SessionProvider({ children, box }: { children: ReactNode; box?: Box }) {
  const theBox = useMemo(
    () => box ?? Box.connect(window.location.origin, browserPlatform()),
    [box],
  );
  const [entry, setEntry] = useState<Entry>({ kind: 'loading' });
  const [check, setCheck] = useState(0);
  const [unlocked, setUnlockedState] = useState<Unlocked | null>(null);

  useEffect(() => {
    let live = true;
    entryFor(theBox).then((e) => live && setEntry(e));
    return () => {
      live = false;
    };
  }, [theBox, check]);

  const recheck = useCallback(() => {
    setEntry({ kind: 'loading' });
    setCheck((n) => n + 1);
  }, []);

  const setUnlocked = useCallback(
    (u: Unlocked | null) => {
      setUnlockedState((prev) => {
        if (prev && prev !== u) prev.lock();
        return u;
      });
      if (!u) recheck();
    },
    [recheck],
  );

  const { banner, status, refresh } = useStatusPoll(unlocked, setUnlocked);

  const value = useMemo<SessionValue>(
    () => ({
      box: theBox,
      entry,
      recheck,
      unlocked,
      setUnlocked,
      banner,
      status,
      refreshStatus: refresh,
    }),
    [theBox, entry, recheck, unlocked, setUnlocked, banner, status, refresh],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

async function entryFor(box: Box): Promise<Entry> {
  try {
    const info = await box.info();
    if (!info.setUp) return { kind: 'setup' };
    const r = await box.login();
    if (r === 'not_paired') return { kind: 'connect', revoked: false };
    if (r === 'revoked') return { kind: 'connect', revoked: true };
    return { kind: 'unlock' };
  } catch (e) {
    if (e instanceof ClientError && e.code === 'box_unreachable') return { kind: 'unreachable' };
    return { kind: 'unreachable' };
  }
}

const CHECKING: BannerInput = { kind: 'checking' };

type Polled = { for: Unlocked; banner: BannerInput; status: Status | null };

function useStatusPoll(unlocked: Unlocked | null, setUnlocked: (u: Unlocked | null) => void) {
  // Each answer remembers which account asked, so after a lock or a new
  // unlock an old answer is never shown: the banner says "checking" instead.
  const [polled, setPolled] = useState<Polled | null>(null);
  const inFlight = useRef(false);
  // A refresh asked for during a poll runs straight after it, never dropped.
  const again = useRef<{ sync: boolean } | null>(null);

  const refresh = useCallback(
    (o: { sync?: boolean } = {}) => {
      const run = (sync: boolean) => {
        if (!unlocked) return;
        if (inFlight.current) {
          again.current = { sync: sync || (again.current?.sync ?? false) };
          return;
        }
        inFlight.current = true;
        unlocked
          .status()
          .then((s) => {
            setPolled({ for: unlocked, banner: { kind: 'status', status: s }, status: s });
            // Items change state on the box (verified, copied to the backup) and
            // other devices add photos: an incremental sync picks both up.
            if (sync) unlocked.library.sync().catch(() => {});
          })
          .catch((e: unknown) => {
            const code = e instanceof ClientError ? e.code : null;
            // Locked meanwhile: this answer is stale and is never shown.
            if (code === 'locked') return;
            // This browser was revoked (or lost its key): lock, and the entry
            // check shows why.
            if (code === 'revoked' || code === 'not_paired') {
              setUnlocked(null);
              return;
            }
            // Any other failure: an old "safe" answer is no longer known to
            // be true, so the banner goes back to checking.
            setPolled({
              for: unlocked,
              banner: code === 'box_unreachable' ? { kind: 'unreachable' } : CHECKING,
              status: null,
            });
          })
          .finally(() => {
            inFlight.current = false;
            const next = again.current;
            again.current = null;
            if (next) run(next.sync);
          });
      };
      run(o.sync ?? true);
    },
    [unlocked, setUnlocked],
  );

  useEffect(() => {
    if (!unlocked) return;
    refresh();
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer === null) timer = setInterval(() => refresh(), STATUS_POLL_MS);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [unlocked, refresh]);

  const current = polled && polled.for === unlocked ? polled : null;
  return {
    banner: current?.banner ?? CHECKING,
    status: current?.status ?? null,
    refresh,
  };
}

function useSession(): SessionValue {
  const s = useContext(SessionContext);
  if (!s) throw new Error('SessionProvider is missing.');
  return s;
}

export const useBox = () => useSession().box;
export const useEntry = () => {
  const s = useSession();
  return { entry: s.entry, recheck: s.recheck };
};
export const useUnlocked = () => {
  const s = useSession();
  return { unlocked: s.unlocked, setUnlocked: s.setUnlocked };
};
/** The box status for the banner and the Box screen; refresh() after uploads. */
export const useStatus = () => {
  const s = useSession();
  return { banner: s.banner, status: s.status, refresh: s.refreshStatus };
};

const EMPTY: LibrarySnapshot = { collections: new Map(), items: new Map(), syncedAt: null };
const noLibrary = {
  subscribe: () => () => {},
  snapshot: () => EMPTY,
} as unknown as Library;

/** The decrypted library index; re-renders on every change. */
export function useLibrary(): { library: Library | null; snapshot: LibrarySnapshot } {
  const lib = useSession().unlocked?.library ?? null;
  const source = lib ?? noLibrary;
  const snapshot = useSyncExternalStore(
    useCallback((fn) => source.subscribe(fn), [source]),
    () => source.snapshot(),
  );
  return { library: lib, snapshot };
}
