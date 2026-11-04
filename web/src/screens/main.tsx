import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronIcon, TrashIcon } from '../app/icons.tsx';
import { useLibrary } from '../app/session.tsx';
import { useTitle } from '../app/title.ts';
import { AddDevice } from './box/AddDevice.tsx';
import { Devices } from './box/Devices.tsx';

// Main screens inside the shell. Tasks 13–17 fill them in.

function Screen({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  useTitle(title);
  return (
    <>
      <header className="screen-header">
        <h1>{title}</h1>
        {action}
      </header>
      {children}
    </>
  );
}

export { PhotosScreen, PhotoViewerScreen } from './photos/Photos.tsx';
/** Albums (Task 15 fills it in). For now: the way to Trash, with its count. */
export function AlbumsScreen() {
  const { snapshot } = useLibrary();
  let trashed = 0;
  for (const item of snapshot.items.values()) if (item.trashedAt) trashed++;
  return (
    <Screen title="Albums">
      <nav aria-label="More" className="more-links">
        <Link to="/trash" className="more-link">
          <TrashIcon size={22} />
          <span>
            Trash · <span className="more-link__count">{trashed.toLocaleString()}</span>
          </span>
          <ChevronIcon size={20} />
        </Link>
      </nav>
    </Screen>
  );
}
export const AlbumScreen = () => <Screen title="Album" />;
export const FavouritesScreen = () => <Screen title="Favourites" />;
export const VideosScreen = () => <Screen title="Videos" />;
export { TrashScreen } from './Trash.tsx';
export const FilesScreen = () => <Screen title="Files" />;
export const FolderScreen = () => <Screen title="Folder" />;
// Task 17 adds status, storage, copies, Rename, Revoke, password and Lock.
export const BoxScreen = () => (
  <Screen title="Box">
    <div className="box-sections">
      <Devices />
      <AddDevice />
    </div>
  </Screen>
);
