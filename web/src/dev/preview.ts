import type { Status } from '@cloudbox/core';
import type { ShellProps } from '../app/Shell.tsx';

/**
 * Dev only: `?preview=safe|copying|paused|full|unreachable` on a main route
 * shows the real frame with sample numbers, without unlocking, so its states
 * can be seen and captured. Never in the production build.
 */
export function devPreview(search: string): ShellProps | null {
  const kind = new URLSearchParams(search).get('preview');
  if (!kind) return null;
  const status = (over: Partial<Status>, items: Partial<Status['items']> = {}): Status => ({
    safe: true,
    items: {
      total: 12480,
      verified: 12480,
      replicated: 12480,
      notYetCopied: 0,
      trashed: 0,
      ...items,
    },
    devices: [],
    drives: [
      { role: 'main', sizeBytes: 1e12, freeBytes: 588e9 },
      { role: 'backup', sizeBytes: 1e12, freeBytes: 588e9 },
    ],
    lastCopyAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    warnings: [],
    ...over,
  });
  const warn = (code: string) => [{ code, message: '', action: '' }];
  const storage = { usedBytes: 412e9, sizeBytes: 1e12 };
  switch (kind) {
    case 'safe':
      return { banner: { kind: 'status', status: status({}) }, storage, photoCount: 12480 };
    case 'copying':
      return {
        banner: {
          kind: 'status',
          status: status({ safe: false }, { notYetCopied: 3, replicated: 12477 }),
        },
        storage,
        photoCount: 12480,
      };
    case 'paused':
      return {
        banner: {
          kind: 'status',
          status: status({ safe: false, warnings: warn('backup_missing') }),
        },
        storage,
        photoCount: 12480,
      };
    case 'full':
      return {
        banner: { kind: 'status', status: status({ warnings: warn('storage_low') }) },
        storage: { usedBytes: 962e9, sizeBytes: 1e12 },
        photoCount: 12480,
      };
    case 'unreachable':
      return { banner: { kind: 'unreachable' }, storage: null, photoCount: null };
    default:
      return null;
  }
}
