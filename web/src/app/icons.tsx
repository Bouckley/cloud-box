import type { ReactElement } from 'react';

/**
 * Line icons from the design canvas: 24-unit grid, 2 px stroke, rounded caps
 * and joins. Always decorative here: the word beside each icon carries the
 * meaning, so every icon is aria-hidden.
 */
type IconProps = { size?: number; className?: string };

function Icon({
  size = 22,
  className,
  children,
}: IconProps & { children: ReactElement[] | ReactElement }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

export const PhotosIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <circle cx="9" cy="10" r="2" />
    <path d="M21 16l-5-5-9 9" />
  </Icon>
);

export const AlbumsIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="8" width="16" height="12" rx="2" />
    <path d="M7 5h10" />
  </Icon>
);

export const FilesIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Icon>
);

export const BoxIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M4 14h16" />
    <path d="M8 17h2" />
  </Icon>
);

export const ShieldCheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" />
    <path d="M8.5 12l2.5 2.5 4.5-5" />
  </Icon>
);

export const ShieldClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" />
    <path d="M12 8.5V12l2.5 1.5" />
  </Icon>
);

/** Copying: a shield with two arrows going round (the backup copy running). */
export const ShieldSyncIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" />
    <path d="M9 11.5a3 3 0 0 1 5.2-1.6L15 11" />
    <path d="M15 8.5V11h-2.5" />
    <path d="M15 13a3 3 0 0 1-5.2 1.6L9 14" />
    <path d="M9 16.5V14h2.5" />
  </Icon>
);

export const WarningIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3l10 18H2z" />
    <path d="M12 10v5" />
    <path d="M12 18h.01" />
  </Icon>
);

export const NoSignalIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 8.8a15 15 0 0 1 4.2-2.6" />
    <path d="M10.7 5.1A15 15 0 0 1 22 8.8" />
    <path d="M5 12.5a10 10 0 0 1 3.3-2" />
    <path d="M15.4 10.6A10 10 0 0 1 19 12.5" />
    <path d="M8.5 16.1a5 5 0 0 1 7 0" />
    <path d="M12 20h.01" />
    <path d="M3 3l18 18" />
  </Icon>
);

export const ChevronIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 5l7 7-7 7" />
  </Icon>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
);

export const PlayIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 5.5v13l10.5-6.5z" />
  </Icon>
);

export const FileIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </Icon>
);

export const HeartIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 20s-7.5-4.6-9.3-9.2C1.6 7.9 3.6 4.5 7 4.5c2 0 3.5 1.1 5 3 1.5-1.9 3-3 5-3 3.4 0 5.4 3.4 4.3 6.3C19.5 15.4 12 20 12 20z" />
  </Icon>
);

export const DownloadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4v11" />
    <path d="M7 10l5 5 5-5" />
    <path d="M5 20h14" />
  </Icon>
);

export const UploadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 20V9" />
    <path d="M7 14l5-5 5 5" />
    <path d="M5 4h14" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12" />
    <path d="M18 6L6 18" />
  </Icon>
);

export const InfoIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <path d="M12 8h.01" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

export const UpDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 9l4-4 4 4" />
    <path d="M8 15l4 4 4-4" />
  </Icon>
);
