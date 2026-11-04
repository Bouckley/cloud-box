import type { APIRequestContext } from '@playwright/test';

/** The box's dev-only simulator API (doc 07), for driving hardware in tests. */
export type Sim = {
  pressButton(): Promise<void>;
  runJob(name: 'replicate' | 'purge' | 'cleanup' | 'light'): Promise<unknown>;
  setBackupPresent(present: boolean): Promise<void>;
  advanceClock(seconds: number): Promise<void>;
};

export function simOf(api: APIRequestContext, url: string): Sim {
  const post = async (path: string, data?: unknown) => {
    const res = await api.post(`${url}${path}`, data === undefined ? {} : { data });
    if (!res.ok()) throw new Error(`${path}: ${res.status()}`);
    const text = await res.text();
    return text ? (JSON.parse(text) as unknown) : null;
  };
  return {
    async pressButton() {
      await post('/dev/sim/button', { kind: 'short' });
    },
    runJob: (name) => post(`/dev/sim/jobs/${name}`),
    async setBackupPresent(present) {
      await post('/dev/sim/drives/backup', { present });
    },
    async advanceClock(seconds) {
      await post('/dev/sim/clock/advance', { seconds });
    },
  };
}
