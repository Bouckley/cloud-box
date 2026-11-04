import type { KdfParams } from '@cloudbox/crypto';

/** Runs Argon2id in a module worker (one per call, terminated after). */
export function deriveKekInWorker(
  password: string,
  salt: Uint8Array,
  kdf: KdfParams,
): Promise<Uint8Array> {
  const worker = new Worker(new URL('./kdfWorker.ts', import.meta.url), { type: 'module' });
  return new Promise<Uint8Array>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<{ ok: boolean; kek?: Uint8Array }>) => {
      worker.terminate();
      if (e.data.ok && e.data.kek) resolve(e.data.kek);
      else reject(new Error('Could not check the password on this device.'));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error('Could not check the password on this device.'));
    };
    worker.postMessage({ password, salt, kdf });
  });
}
