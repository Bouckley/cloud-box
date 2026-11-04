import { NavLink } from 'react-router';
import { AlbumsIcon, BoxIcon, FilesIcon, PhotosIcon } from './icons.tsx';

const ITEMS = [
  { to: '/photos', label: 'Photos', Icon: PhotosIcon },
  { to: '/albums', label: 'Albums', Icon: AlbumsIcon },
  { to: '/files', label: 'Files', Icon: FilesIcon },
  { to: '/box', label: 'Box', Icon: BoxIcon },
] as const;

/** The four fixed areas, in the order of the canvas. */
export function NavItems({ attention }: { attention: boolean }) {
  return ITEMS.map(({ to, label, Icon }) => {
    const flagged = attention && to === '/box';
    return (
      <NavLink
        key={to}
        to={to}
        className="nav-link"
        aria-label={flagged ? `${label}, needs attention` : undefined}
      >
        <span className="nav-link__glyph">
          <Icon size={24} className="nav-link__icon" />
          {flagged && <span className="nav-attention" aria-hidden="true" />}
        </span>
        <span className="nav-link__label">{label}</span>
      </NavLink>
    );
  });
}
