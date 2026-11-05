import { useRef, useState } from 'react';
import { Dialog } from '../../app/Dialog.tsx';
import { LockIcon } from '../../app/icons.tsx';

/**
 * Box › Lock. Locking wipes the keys, which stops any uploads still queued,
 * so while files are uploading it asks first; keeping on is the safe choice.
 */
export function LockButton({ uploading, onLock }: { uploading: number; onLock(): void }) {
  const [asking, setAsking] = useState(false);
  const keep = useRef<HTMLButtonElement>(null);
  const files = uploading === 1 ? "1 file hasn't" : `${uploading} files haven't`;
  return (
    <>
      <button
        type="button"
        className="button"
        onClick={() => (uploading > 0 ? setAsking(true) : onLock())}
      >
        <LockIcon size={18} />
        Lock
      </button>
      {asking && (
        <Dialog
          title="Lock while uploading?"
          initialFocus={keep}
          onClose={() => setAsking(false)}
          className="sheet"
        >
          <p className="sheet__lede">
            {files} finished uploading. Locking stops them, and you&apos;ll need to add them again.
          </p>
          <div className="dialog__actions">
            <button ref={keep} type="button" className="button" onClick={() => setAsking(false)}>
              Keep uploading
            </button>
            <button
              type="button"
              className="button button--ink"
              onClick={() => {
                setAsking(false);
                onLock();
              }}
            >
              Lock anyway
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
