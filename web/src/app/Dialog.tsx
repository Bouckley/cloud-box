import { useEffect, useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';

export type DialogProps = {
  title: string;
  /** The control that gets focus when the dialog opens (the safe choice). */
  initialFocus: RefObject<HTMLElement | null>;
  /** Esc, or the dialog closing any other way. Ignored while `busy`. */
  onClose(): void;
  busy?: boolean | undefined;
  /** Where focus goes on close if the opener has left the page (its row was deleted). */
  returnFocus?: (() => HTMLElement | null) | undefined;
  className?: string | undefined;
  children: ReactNode;
};

/**
 * A modal native `<dialog>`, open while mounted. It is labelled by its title,
 * starts on `initialFocus`, closes on Esc, and gives focus back to whatever had
 * it before (the button that opened it).
 */
export function Dialog({
  title,
  initialFocus,
  onClose,
  busy,
  returnFocus,
  className,
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const latest = useRef({ onClose, busy, returnFocus });
  const mounted = useRef(false);
  // Closes this component asked for itself. The browser reports each one with
  // a close event on a later task, after a StrictMode remount (dev builds) has
  // opened the dialog again; those must not read as the user closing it.
  const selfClosed = useRef(0);
  useLayoutEffect(() => {
    latest.current = { onClose, busy, returnFocus };
  });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    }
    initialFocus.current?.focus();
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (d.open && typeof d.close === 'function') {
        selfClosed.current++;
        d.close();
      } else d.removeAttribute('open');
      if (opener?.isConnected) opener.focus();
      else latest.current.returnFocus?.()?.focus();
    };
    // Opened once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <dialog
      ref={ref}
      className={`dialog${className ? ` ${className}` : ''}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        // Esc: the parent unmounts the dialog, which closes it.
        e.preventDefault();
        if (!latest.current.busy) latest.current.onClose();
      }}
      onClose={(e) => {
        // The browser may close it anyway (Chrome lets a page block Esc only
        // once). While busy, open it again so its result or error is seen.
        if (selfClosed.current > 0) {
          selfClosed.current--;
          return;
        }
        if (!mounted.current) return;
        const d = e.currentTarget;
        if (latest.current.busy) {
          if (d.open) return;
          if (typeof d.showModal === 'function') d.showModal();
          else d.setAttribute('open', '');
        } else latest.current.onClose();
      }}
    >
      <h2 id={titleId} className="dialog__title">
        {title}
      </h2>
      {children}
    </dialog>
  );
}
