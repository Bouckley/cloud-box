import { execFile, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Agent, fetch as undiciFetch } from 'undici';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

export type RunningBox = {
  baseUrl: string;
  dataDir: string;
  fetch: typeof fetch;
  logs(): string;
  stop(): Promise<void>;
};

/**
 * Builds boxd with the sim tag into a temp dir, starts it on a free port with
 * a data dir whose path has a space, and returns a fetch that trusts only the
 * certificate boxd wrote.
 */
export async function startBoxd(): Promise<RunningBox> {
  const tmp = await mkdtemp(join(tmpdir(), 'cloudbox-contract-'));
  const bin = join(tmp, 'boxd');
  await promisify(execFile)('go', [
    '-C',
    join(repoRoot, 'box'),
    'build',
    '-tags',
    'sim',
    '-o',
    bin,
    './cmd/boxd',
  ]);

  const dataDir = join(tmp, 'with space');
  const child = spawn(bin, ['--hal=sim', `--data=${dataDir}`, '--addr=127.0.0.1:0'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const onData = (chunk: Buffer) => {
    output += chunk.toString('utf8');
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));

  const baseUrl = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`boxd did not start:\n${output}`)), 30_000);
    const check = () => {
      const m = /addr=(https:\/\/127\.0\.0\.1:\d+)/.exec(output);
      if (m?.[1]) {
        clearTimeout(timer);
        child.stderr.off('data', check);
        resolve(m[1]);
      }
    };
    child.stderr.on('data', check);
    child.once('exit', (code) => reject(new Error(`boxd exited (${code}):\n${output}`)));
  });

  const ca = await readFile(join(dataDir, 'tls', 'cert.pem'), 'utf8');
  const dispatcher = new Agent({ connect: { ca } });
  // undici's own fetch with its own Agent, so this works whatever undici
  // version the running Node bundles. Requests are buffered (test sizes only).
  const pinnedFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const res = await undiciFetch(req.url, {
      method: req.method,
      headers: [...req.headers],
      dispatcher,
      ...(req.body ? { body: new Uint8Array(await req.arrayBuffer()) } : {}),
    });
    return res as unknown as Response;
  }) as typeof fetch;

  return {
    baseUrl,
    dataDir,
    fetch: pinnedFetch,
    logs: () => output,
    async stop() {
      child.kill('SIGTERM');
      await exited;
      await dispatcher.close();
      await rm(tmp, { recursive: true, force: true });
    },
  };
}
