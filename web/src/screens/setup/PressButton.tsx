import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useBox } from '../../app/session.tsx';
import { Actions, Solo } from '../Solo.tsx';

export const SETUP_POLL_MS = 2000;

/**
 * Setup step 1: wait for the press. Asks the box every 2 s; no countdown and
 * no time limit on this page. `again` is the second press after setup closed.
 */
export function PressButton({
  again,
  pollMs = SETUP_POLL_MS,
  onPressed,
  onSetUpElsewhere,
}: {
  again?: boolean | undefined;
  pollMs?: number | undefined;
  onPressed(): void;
  onSetUpElsewhere(): void;
}) {
  const box = useBox();
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = async () => {
      try {
        const info = await box.info();
        if (!live) return;
        setUnreachable(false);
        if (info.setUp) return onSetUpElsewhere();
        if (info.setupOpen) return onPressed();
      } catch {
        if (live) setUnreachable(true);
      }
      if (live) timer = setTimeout(() => void ask(), pollMs);
    };
    void ask();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [box, pollMs, onPressed, onSetUpElsewhere]);

  return (
    <Solo
      title="Set up your Cloud Box"
      fullTitle
      lede={
        again
          ? 'Setup closed while you were writing. Press the power button on the front of your box once more. Your 24 words stay the same.'
          : 'Press the power button on the front of your box once. This page moves on by itself when the box sees the press.'
      }
    >
      <p className="solo__waiting" role="status">
        {unreachable
          ? "Can't reach your box yet. Check its light is on and this computer is on your home network. Still trying."
          : 'Waiting for the press…'}
      </p>
      <Actions step={again ? undefined : 1}>
        {import.meta.env.DEV && (
          <Link className="button" to="/sim" target="_blank" rel="noreferrer">
            Open the simulator
          </Link>
        )}
      </Actions>
    </Solo>
  );
}
