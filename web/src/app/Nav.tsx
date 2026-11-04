import { Link, useLocation } from 'react-router';
import { AlbumsIcon, BoxIcon, FilesIcon, PhotosIcon } from './icons.tsx';

const ITEMS = [
  { to: '/photos', label: 'Photos', Icon: PhotosIcon },
  // Trash is reached from Albums, so Albums stays marked there.
  { to: '/albums', label: 'Albums', Icon: AlbumsIcon, also: '/trash' },
  { to: '/files', label: 'Files', Icon: FilesIcon },
  { to: '/box', label: 'Box', Icon: BoxIcon },
] as const;

/** The four fixed areas, in the order of the canvas. */
export function NavItems({ attention }: { attention: boolean }) {
  const { pathname } = useLocation();
  return ITEMS.map((item) => {
    const { to, label, Icon } = item;
    const flagged = attention && to === '/box';
    const under = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
    // The area's own page is "page"; a page reached from it (Trash) is "true".
    const current = pathname === to ? 'page' : under(to) || ('also' in item && under(item.also));
    return (
      <Link
        key={to}
        to={to}
        className="nav-link"
        aria-label={flagged ? `${label}, needs attention` : undefined}
        aria-current={current === 'page' ? 'page' : current ? 'true' : undefined}
      >
        <span className="nav-link__glyph">
          <Icon size={24} className="nav-link__icon" />
          {flagged && <span className="nav-attention" aria-hidden="true" />}
        </span>
        <span className="nav-link__label">{label}</span>
      </Link>
    );
  });
}
