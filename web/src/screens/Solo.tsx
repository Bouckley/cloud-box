import { useEffect, useRef, type ReactNode } from 'react';
import { BoxIcon } from '../app/icons.tsx';
import { useTitle } from '../app/title.ts';

/** The centred single-task page: product mark, one h1, one job. */
export function Solo({
  title,
  fullTitle,
  lede,
  busy,
  children,
}: {
  title: string;
  fullTitle?: boolean;
  lede?: ReactNode;
  busy?: boolean;
  children?: ReactNode;
}) {
  useTitle(title, fullTitle);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // A new step replaces the button that had focus: start the person (and
    // their screen reader) at the new heading rather than the top of the page.
    const active = document.activeElement;
    if (!active || active === document.body) heading.current?.focus();
  }, [title]);
  return (
    <div className="solo">
      <main className="solo__panel" id="content" aria-busy={busy || undefined}>
        <p className="solo__brand">
          <BoxIcon size={24} />
          <span>Cloud Box</span>
        </p>
        <h1 ref={heading} tabIndex={-1}>
          {title}
        </h1>
        {lede && <p className="lede">{lede}</p>}
        {children}
      </main>
    </div>
  );
}

/** The button row: the primary action first, then Back, then the step. */
export function Actions({ children, step }: { children: ReactNode; step?: number | undefined }) {
  return (
    <div className="solo__actions">
      {children}
      {step !== undefined && <p className="solo__step">Step {step} of 5</p>}
    </div>
  );
}

export const LoadingScreen = () => (
  <div className="solo">
    <main className="solo__panel" id="content" aria-busy="true">
      <p className="lede" role="status">
        Connecting to your box…
      </p>
    </main>
  </div>
);
