import type { ReactNode } from 'react';
import { useTitle } from '../app/title.ts';

// Main screens inside the shell. Tasks 13–17 fill them in.

function Screen({ title, children }: { title: string; children?: ReactNode }) {
  useTitle(title);
  return (
    <>
      <header className="screen-header">
        <h1>{title}</h1>
      </header>
      {children}
    </>
  );
}

export const PhotosScreen = () => <Screen title="Photos" />;
export const PhotoViewerScreen = () => <Screen title="Photo" />;
export const AlbumsScreen = () => <Screen title="Albums" />;
export const AlbumScreen = () => <Screen title="Album" />;
export const FavouritesScreen = () => <Screen title="Favourites" />;
export const VideosScreen = () => <Screen title="Videos" />;
export const TrashScreen = () => <Screen title="Trash" />;
export const FilesScreen = () => <Screen title="Files" />;
export const FolderScreen = () => <Screen title="Folder" />;
export const BoxScreen = () => <Screen title="Box" />;
