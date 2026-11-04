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
export const AlbumsScreen = () => <Screen title="Albums" />;
export const AlbumScreen = () => <Screen title="Album" />;
export const FavouritesScreen = () => <Screen title="Favourites" />;
export const VideosScreen = () => <Screen title="Videos" />;
export const TrashScreen = () => <Screen title="Trash" />;
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
