import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test as base, request, type APIRequestContext } from '@playwright/test';
import { BOXD } from './global-setup.ts';
import { simOf, type Sim } from './helpers/sim.ts';

export type RunningBox = { url: string; dataDir: string; sim: Sim };

/**
 * `box`: a boxd of its own for each test, on a free port, with a data dir
 * whose path has a space. `baseURL` points at it, so `page.goto('/')` works.
 */
export const test = base.extend<{ box: RunningBox; api: APIRequestContext }>({
  api: async ({}, use) => {
    const ctx = await request.newContext({ ignoreHTTPSErrors: true });
    await use(ctx);
    await ctx.dispose();
  },
  box: async ({ api }, use) => {
    const tmp = await mkdtemp(join(tmpdir(), 'cloudbox-e2e-'));
    const dataDir = join(tmp, 'with space');
    const child = spawn(BOXD, ['--hal=sim', `--data=${dataDir}`, '--addr=127.0.0.1:0'], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let log = '';
    const url = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`boxd did not start:\n${log}`)), 30_000);
      child.stderr.on('data', (chunk: Buffer) => {
        log += chunk.toString('utf8');
        const m = /addr=(https:\/\/127\.0\.0\.1:\d+)/.exec(log);
        if (m?.[1]) {
          clearTimeout(timer);
          resolve(m[1]);
        }
      });
      child.once('exit', (code) => reject(new Error(`boxd exited (${code}):\n${log}`)));
    });
    await use({ url, dataDir, sim: simOf(api, url) });
    const exited = new Promise((r) => child.once('exit', r));
    child.kill('SIGTERM');
    await exited;
    await rm(tmp, { recursive: true, force: true });
  },
  baseURL: async ({ box }, use) => {
    await use(box.url);
  },
});

export { expect } from '@playwright/test';
