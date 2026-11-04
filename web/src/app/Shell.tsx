import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { bytesText } from './format.ts';
import { BoxIcon } from './icons.tsx';
import { NavItems } from './Nav.tsx';
import { bannerModel, SafetyBanner, type BannerInput } from './SafetyBanner.tsx';

export type ShellProps = {
  banner: BannerInput;
  /** The main drive; null hides the meter (unknown or unreachable). */
  storage: { usedBytes: number; sizeBytes: number } | null;
  /** Photos in the library, for "All {n} photos are safe" on Photos. */
  photoCount: number | null;
};

/**
 * The frame of every main screen: skip link, navigation (sidebar above 720 px,
 * bottom tabs at or below), and <main> with the safety banner first. Each
 * screen renders its own single <h1>.
 */
export function Shell({ banner, storage, photoCount }: ShellProps) {
  const { pathname } = useLocation();
  const now = useNow();
  const onBox = pathname === '/box' || pathname.startsWith('/box/');
  const onPhotos = pathname === '/photos';
  const attention = bannerModel(banner, now).tone === 'attention';

  return (
    <div className="shell">
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      {/* One nav: a sidebar above 720 px, fixed bottom tabs at or below (CSS). */}
      <div className="sidebar">
        <div className="brand">
          <BoxIcon size={30} />
          <span>Cloud Box</span>
        </div>
        <nav aria-label="Main" className="nav">
          <NavItems attention={attention} />
        </nav>
        {storage && <StorageCard {...storage} />}
      </div>
      <main id="content" className="main" tabIndex={-1}>
        <SafetyBanner
          input={banner}
          now={now}
          photoCount={onPhotos ? photoCount : null}
          linkToBox={!onBox}
        />
        <Outlet />
      </main>
    </div>
  );
}

function StorageCard({ usedBytes, sizeBytes }: { usedBytes: number; sizeBytes: number }) {
  const pct =
    sizeBytes > 0 ? Math.min(100, Math.max(0, Math.round((usedBytes / sizeBytes) * 100))) : 0;
  return (
    <div className="storage">
      <span className="storage__label">
        {bytesText(usedBytes)} of {bytesText(sizeBytes)} used
      </span>
      <div className="meter" role="img" aria-label={`${pct} percent of storage used`}>
        <MeterFill pct={pct} />
      </div>
    </div>
  );
}

/** Width set through the CSSOM (allowed by the CSP), never an inline style attribute. */
function MeterFill({ pct }: { pct: number }) {
  return (
    <div
      className="meter__fill"
      ref={(el) => {
        el?.style.setProperty('width', `${pct}%`);
      }}
    />
  );
}

/** The current time, refreshed each minute so "5 min ago" stays true. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}
