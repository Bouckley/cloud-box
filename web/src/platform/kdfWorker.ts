/// <reference lib="webworker" />
import { deriveKek, ready, type KdfParams } from '@cloudbox/crypto';

type Request = { password: string; salt: Uint8Array; kdf: KdfParams };

// Argon2id off the main thread, so the page stays responsive while it runs.
// One worker per call; the page terminates it after the answer.
self.onmessage = async (e: MessageEvent<Request>) => {
  try {
    await ready();
    const kek = deriveKek(e.data.password, e.data.salt, e.data.kdf);
    (self as DedicatedWorkerGlobalScope).postMessage({ ok: true, kek }, [kek.buffer]);
  } catch {
    // Never echo the input or the error text: it could include the password.
    (self as DedicatedWorkerGlobalScope).postMessage({ ok: false });
  }
};
