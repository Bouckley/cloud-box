/** Formatting for status text. Plain words, the user's locale for clock times. */

const MINUTE = 60_000;

/** "just now", "5 min ago", "at 2:00 AM", "yesterday at 2:00 AM", "on 3 Nov". */
export function sinceText(when: Date, now: Date): string {
  const ms = now.getTime() - when.getTime();
  if (ms < MINUTE) return 'just now';
  if (ms < 60 * MINUTE) return `${Math.floor(ms / MINUTE)} min ago`;
  const time = when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (sameDay(when, now)) return `at ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(when, yesterday)) return `yesterday at ${time}`;
  const date = when.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(when.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
  return `on ${date}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const UNITS = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

/** Decimal units, as drives are sold: 412 GB, 1 TB, 1.5 TB. */
export function bytesText(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  let i = 0;
  let v = n;
  while (v >= 1000 && i < UNITS.length - 1) {
    v /= 1000;
    i++;
  }
  const digits = v >= 100 || i === 0 ? 0 : v >= 10 ? 0 : 1;
  const shown = Number(v.toFixed(digits));
  return `${shown.toLocaleString()} ${UNITS[i]}`;
}

export function countText(n: number): string {
  return n.toLocaleString();
}
