import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
export const BOXD = join(here, '.cache', 'boxd');

/** Builds the web app once, then a sim boxd that embeds it. */
export default async function globalSetup(): Promise<void> {
  await run('make', ['web'], { cwd: root, maxBuffer: 1 << 26 });
  await mkdir(dirname(BOXD), { recursive: true });
  await run('go', ['-C', join(root, 'box'), 'build', '-tags', 'sim', '-o', BOXD, './cmd/boxd'], {
    maxBuffer: 1 << 26,
  });
}
