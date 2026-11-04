import { useRef } from 'react';
import { UploadIcon } from '../../app/icons.tsx';
import { useUploads } from '../../app/uploads.ts';
import { fileSource } from '../../platform/media.ts';

/** "Upload photos": opens the file picker; chosen files join the upload queue. Waits for the first sync. */
export function UploadButton({ ready }: { ready: boolean }) {
  const { queue } = useUploads();
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        className="button button--primary"
        onClick={() => input.current?.click()}
        disabled={!queue || !ready}
      >
        <UploadIcon size={18} />
        Upload photos
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/*,video/*,.heic,.heif"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? []);
          e.currentTarget.value = '';
          queue?.add(files.map(fileSource));
        }}
      />
    </>
  );
}
