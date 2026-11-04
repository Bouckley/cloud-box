import type { ReactNode } from 'react';
import { PhotosIcon } from '../app/icons.tsx';
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

// Task 13 wires Upload photos and the timeline; this is the empty library.
export const PhotosScreen = () => (
  <Screen
    title="Photos"
    action={
      <button type="button" className="button button--primary">
        Upload photos
      </button>
    }
  >
    <div className="empty">
      <PhotosIcon size={40} />
      <h2>No photos yet</h2>
      <p>Photos you upload are locked on this computer before they go to your box.</p>
    </div>
  </Screen>
);
export const PhotoViewerScreen = () => <Screen title="Photo" />;
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
