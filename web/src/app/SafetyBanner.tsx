import type { Status } from '@cloudbox/core';
import type { ReactElement } from 'react';
import { Link } from 'react-router';
import { countText, sinceText } from './format.ts';
import {
  ChevronIcon,
  NoSignalIcon,
  ShieldCheckIcon,
  ShieldClockIcon,
  ShieldSyncIcon,
  WarningIcon,
} from './icons.tsx';

/** What the banner knows: nothing yet, a status from the box, or no answer. */
export type BannerInput =
  { kind: 'checking' } | { kind: 'status'; status: Status } | { kind: 'unreachable' };

type Tone = 'safe' | 'quiet' | 'copying' | 'attention';
type Model = {
  tone: Tone;
  role: 'status' | 'alert';
  icon: (p: { size?: number }) => ReactElement;
  title: string;
  detail: string | null;
};

/**
 * The words for each state (M2 Copy table). "Safe" appears only when the box
 * says `safe: true` and no warning stands; anything else names what is wrong.
 */
export function bannerModel(input: BannerInput, now: Date, photoCount?: number | null): Model {
  if (input.kind === 'checking') {
    return {
      tone: 'quiet',
      role: 'status',
      icon: ShieldClockIcon,
      title: 'Checking your box…',
      detail: null,
    };
  }
  if (input.kind === 'unreachable') {
    return {
      tone: 'attention',
      role: 'alert',
      icon: NoSignalIcon,
      title: "Can't reach your box",
      detail:
        'Check the light on the front of the box is on, and that this computer is on your home network.',
    };
  }
  const { status } = input;
  const codes = new Set(status.warnings.map((w) => w.code));
  if (codes.has('backup_missing')) {
    return {
      tone: 'attention',
      role: 'alert',
      icon: WarningIcon,
      title: 'Backup copy paused',
      detail: "The backup drive isn't connected. Your photos are on the main drive only.",
    };
  }
  if (codes.has('storage_low')) {
    return {
      tone: 'attention',
      role: 'alert',
      icon: WarningIcon,
      title: 'Your box is almost full',
      detail: 'Free up space or add a drive soon.',
    };
  }
  if (!status.safe) {
    const waiting = Math.max(
      status.items.notYetCopied,
      status.items.total - status.items.replicated,
      0,
    );
    return {
      tone: 'copying',
      role: 'status',
      icon: ShieldSyncIcon,
      title: `${countText(waiting)} waiting for the backup copy`,
      detail: "They're on your box. The backup copy runs every hour.",
    };
  }
  const title =
    photoCount !== undefined && photoCount !== null && photoCount > 0
      ? `All ${countText(photoCount)} photos are safe`
      : 'Everything is safe';
  const detail = status.lastCopyAt
    ? `Backup copy updated ${sinceText(new Date(status.lastCopyAt), now)}`
    : null;
  return { tone: 'safe', role: 'status', icon: ShieldCheckIcon, title, detail };
}

export type SafetyBannerProps = {
  input: BannerInput;
  now: Date;
  /** On Photos: the count for "All {n} photos are safe". */
  photoCount?: number | null;
  /** The whole banner links to Box, except on Box itself. */
  linkToBox: boolean;
  /** On Box it is the screen's status card: the same states, larger. */
  large?: boolean | undefined;
};

export function SafetyBanner({ input, now, photoCount, linkToBox, large }: SafetyBannerProps) {
  const m = bannerModel(input, now, photoCount);
  const body = (
    <>
      <m.icon size={large ? 34 : m.tone === 'attention' ? 28 : 22} />
      <span className="banner__text">
        <span className="banner__title">{m.title}</span>
        {m.detail && <span className="banner__detail">{m.detail}</span>}
      </span>
      {linkToBox && <ChevronIcon size={20} className="banner__chevron" />}
    </>
  );
  const className = `banner banner--${m.tone}${large ? ' banner--large' : ''}`;
  // The live region wraps the banner so its words are announced when they
  // change; the link inside stays an ordinary link.
  return (
    <div role={m.role} aria-live={m.role === 'alert' ? 'assertive' : 'polite'} data-banner="">
      {linkToBox ? (
        <Link to="/box" className={className}>
          {body}
        </Link>
      ) : (
        <div className={className}>{body}</div>
      )}
    </div>
  );
}
