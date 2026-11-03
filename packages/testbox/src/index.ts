import { execFile, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Agent, fetch as undiciFetch } from 'undici';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

export type RunningBox = {
  baseUrl: string;
  dataDir: string;
  fetch: typeof fetch;
  /** Short-press the sim power button and wait until setup is open. */
  pressButton(): Promise<void>;
  /** Move the box's simulated clock forward. */
  advanceClock(seconds: number): Promise<void>;
  /** Run one of the box's jobs now (replicate, purge, cleanup, light). */
  runJob(name: string): Promise<unknown>;
  /** Plug in or unplug the simulated backup drive. */
  setBackupPresent(present: boolean): Promise<void>;
  logs(): string;
  stop(): Promise<void>;
};

/**
 * Test helper: a real boxd with simulated hardware, for contract and core tests.
 *
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

  const devPost = async (path: string, body?: unknown): Promise<unknown> => {
    const res = await pinnedFetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (res.status !== 200) throw new Error(`POST ${path}: ${res.status} ${await res.text()}`);
    return res.json();
  };

  return {
    baseUrl,
    dataDir,
    fetch: pinnedFetch,
    async advanceClock(seconds) {
      await devPost('/dev/sim/clock/advance', { seconds });
    },
    runJob: (name) => devPost(`/dev/sim/jobs/${encodeURIComponent(name)}`),
    async setBackupPresent(present) {
      await devPost('/dev/sim/drives/backup', { present });
    },
    async pressButton() {
      await devPost('/dev/sim/button', { kind: 'short' });
      // The box handles the press on another goroutine; wait for it.
      const deadline = Date.now() + 5_000;
      for (;;) {
        const info = (await (await pinnedFetch(`${baseUrl}/v1/info`)).json()) as {
          setupOpen: boolean;
        };
        if (info.setupOpen) return;
        if (Date.now() > deadline) throw new Error('setup did not open after the button press');
        await new Promise((r) => setTimeout(r, 20));
      }
    },
    logs: () => output,
    async stop() {
      child.kill('SIGTERM');
      await exited;
      await dispatcher.close();
      await rm(tmp, { recursive: true, force: true });
    },
  };
}
