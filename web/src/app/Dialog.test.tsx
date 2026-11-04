import { fireEvent, render, screen } from '@testing-library/react';
import { StrictMode, useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog.tsx';

function Probe({ busy, onClose }: { busy: boolean; onClose(): void }) {
  const ok = useRef<HTMLButtonElement>(null);
  return (
    <Dialog title="Sure?" initialFocus={ok} onClose={onClose} busy={busy}>
      <button ref={ok}>OK</button>
    </Dialog>
  );
}

/** Chromium's dialog: close() fires its close event on a later task. */
function browserDialog() {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & Record<string, unknown>;
  const saved = { showModal: proto.showModal, close: proto.close };
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  proto.close = function (this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    setTimeout(() => this.dispatchEvent(new Event('close')), 0);
  };
  return () => Object.assign(proto, saved);
}

describe('Dialog', () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it('stays open in StrictMode, where React mounts it twice (dev builds)', async () => {
    restore = browserDialog();
    const onClose = vi.fn();
    render(
      <StrictMode>
        <Probe busy={false} onClose={onClose} />
      </StrictMode>,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveAttribute('open');
  });

  it('Esc is ignored while busy', () => {
    const onClose = vi.fn();
    render(<Probe busy onClose={onClose} />);
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('if the browser closes it while busy, it opens again (its error must stay visible)', () => {
    const onClose = vi.fn();
    render(<Probe busy onClose={onClose} />);
    const d = screen.getByRole('dialog') as HTMLDialogElement;
    // jsdom has no showModal/close: the browser closing it is the attribute going.
    d.removeAttribute('open');
    fireEvent(d, new Event('close'));
    expect(d.hasAttribute('open')).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closed by the browser when not busy: tells the parent', () => {
    const onClose = vi.fn();
    render(<Probe busy={false} onClose={onClose} />);
    const d = screen.getByRole('dialog') as HTMLDialogElement;
    d.removeAttribute('open');
    fireEvent(d, new Event('close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('focus goes to the fallback when the opener is gone', () => {
    const opener = document.createElement('button');
    const fallback = document.createElement('button');
    document.body.append(opener, fallback);
    opener.focus();
    const ok = { current: null as HTMLButtonElement | null };
    const { unmount } = render(
      <Dialog title="Sure?" initialFocus={ok} onClose={() => {}} returnFocus={() => fallback}>
        <button ref={(el) => void (ok.current = el)}>OK</button>
      </Dialog>,
    );
    opener.remove();
    unmount();
    expect(fallback).toHaveFocus();
    fallback.remove();
  });
});
