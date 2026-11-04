import { NewAlbumDialog, type NewAlbumDialogProps } from '../albums/NewAlbumDialog.tsx';

/** Names a new folder, or renames one: the album dialog in a folder's words. */
export const NewFolderDialog = (p: Omit<NewAlbumDialogProps, 'noun'>) => (
  <NewAlbumDialog {...p} noun="folder" />
);
