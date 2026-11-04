import type { ReactNode } from 'react';
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
export { AlbumsScreen } from './albums/Albums.tsx';
export { AlbumScreen, FavouritesScreen, VideosScreen } from './albums/Album.tsx';
export { TrashScreen } from './Trash.tsx';
export { FilesScreen, FolderScreen, FileViewerScreen } from './files/Files.tsx';
// Task 17 adds status, storage, copies, Rename, Revoke, password and Lock.
export const BoxScreen = () => (
  <Screen title="Box">
    <div className="box-sections">
      <Devices />
      <AddDevice />
    </div>
  </Screen>
);
