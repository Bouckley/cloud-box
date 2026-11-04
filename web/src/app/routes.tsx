import { lazy, Suspense, useMemo, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation, type RouteObject } from 'react-router';
import { devPreview } from '../dev/preview.ts';
import { ConnectScreen, ResetScreen } from '../screens/Connect.tsx';
import { ForgotScreen } from '../screens/Forgot.tsx';
import { LoadingScreen } from '../screens/Solo.tsx';
import { SetupScreen } from '../screens/setup/Setup.tsx';
import { UnlockScreen } from '../screens/Unlock.tsx';
import * as screens from '../screens/main.tsx';
import { ErrorView } from './ErrorView.tsx';
import { useEntry, useLibrary, useStatus, useUnlocked, type Entry } from './session.tsx';
import { Shell } from './Shell.tsx';

/** Sends a fresh load to setup, connect or unlock, by `info()` and `login()`. */
function Gate() {
  const { unlocked } = useUnlocked();
  const { entry: e } = useEntry();
  if (unlocked) return <Navigate to="/photos" replace />;
  return <EntryState entry={e}>{(path) => <Navigate to={path} replace />}</EntryState>;
}

function EntryState({ entry: e, children }: { entry: Entry; children(path: string): ReactNode }) {
  const { recheck } = useEntry();
  if (e.kind === 'loading') return <LoadingScreen />;
  if (e.kind === 'unreachable') {
    return (
      <ErrorView
        title="Can't reach your box"
        detail="Check the light on the front of the box is on, and that this computer is on your home network."
        action={{ label: 'Try again', onClick: recheck }}
      />
    );
  }
  return <>{children(`/${e.kind}`)}</>;
}

/** An entry page shows only when it is where this browser should be. */
function EntryRoute({
  want,
  children,
}: {
  want: Entry['kind'] | 'forgot' | 'reset';
  children: ReactNode;
}) {
  const { unlocked } = useUnlocked();
  const { entry: e } = useEntry();
  if (unlocked) return <Navigate to="/photos" replace />;
  const fits =
    e.kind === want ||
    (want === 'forgot' && e.kind === 'unlock') ||
    (want === 'reset' && e.kind === 'connect');
  return (
    <EntryState entry={e}>
      {(path) => (fits ? children : <Navigate to={path} replace />)}
    </EntryState>
  );
}

function ConnectRoute() {
  const { entry: e } = useEntry();
  return (
    <EntryRoute want="connect">
      <ConnectScreen revoked={e.kind === 'connect' && e.revoked} />
    </EntryRoute>
  );
}

/** The shell, wired to the session. Main screens need an unlocked account. */
function AppShell({ requireUnlocked }: { requireUnlocked: boolean }) {
  const { unlocked } = useUnlocked();
  const { banner, status } = useStatus();
  const { snapshot } = useLibrary();
  const photoCount = useMemo(() => {
    let n = 0;
    for (const item of snapshot.items.values()) {
      if (item.trashedAt) continue;
      if (snapshot.collections.get(item.collectionId)?.kind === 'album') n++;
    }
    return n;
  }, [snapshot]);
  const { search } = useLocation();
  const preview = import.meta.env.DEV ? devPreview(search) : null;
  if (preview) return <Shell {...preview} />;
  if (requireUnlocked && !unlocked) return <Navigate to="/" replace />;
  const main = status?.drives.find((d) => d.role === 'main');
  const storage = main
    ? { usedBytes: main.sizeBytes - main.freeBytes, sizeBytes: main.sizeBytes }
    : null;
  return <Shell banner={banner} storage={storage} photoCount={unlocked ? photoCount : null} />;
}

const SimPage = import.meta.env.DEV
  ? lazy(() => import('../dev/SimPage.tsx').then((m) => ({ default: m.SimPage })))
  : null;

export function routes(): RouteObject[] {
  const main: RouteObject[] = [
    { path: '/photos', element: <screens.PhotosScreen /> },
    { path: '/photos/:itemId', element: <screens.PhotoViewerScreen /> },
    { path: '/albums', element: <screens.AlbumsScreen /> },
    { path: '/albums/favourites', element: <screens.FavouritesScreen /> },
    { path: '/albums/videos', element: <screens.VideosScreen /> },
    { path: '/albums/:id', element: <screens.AlbumScreen /> },
    { path: '/trash', element: <screens.TrashScreen /> },
    { path: '/files', element: <screens.FilesScreen /> },
    { path: '/files/:folderId', element: <screens.FolderScreen /> },
    { path: '/box', element: <screens.BoxScreen /> },
  ];
  const list: RouteObject[] = [
    { path: '/', element: <Gate /> },
    {
      path: '/setup',
      element: (
        <EntryRoute want="setup">
          <SetupScreen />
        </EntryRoute>
      ),
    },
    {
      path: '/unlock',
      element: (
        <EntryRoute want="unlock">
          <UnlockScreen />
        </EntryRoute>
      ),
    },
    { path: '/connect', element: <ConnectRoute /> },
    {
      path: '/reset',
      element: (
        <EntryRoute want="reset">
          <ResetScreen />
        </EntryRoute>
      ),
    },
    {
      path: '/forgot',
      element: (
        <EntryRoute want="forgot">
          <ForgotScreen />
        </EntryRoute>
      ),
    },
    { element: <AppShell requireUnlocked />, children: main },
  ];
  if (SimPage) {
    // The simulator sits in the shell (so the frame can be seen in dev) and
    // needs no unlock. It is not in the production build at all.
    list.push({
      element: <AppShell requireUnlocked={false} />,
      children: [
        {
          path: '/sim',
          element: (
            <Suspense fallback={null}>
              <SimPage />
            </Suspense>
          ),
        },
      ],
    });
  }
  list.push({ path: '*', element: <Navigate to="/" replace /> });
  return [{ element: <Outlet />, children: list }];
}

export const createRouter = () => createBrowserRouter(routes());
