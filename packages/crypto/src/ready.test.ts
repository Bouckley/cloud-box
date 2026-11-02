import { describe, expect, it } from 'vitest';
import { randomKey } from './index.ts';

// Vitest isolates each test file, so ready() has not been called here.
describe('before ready()', () => {
  it('throws not_ready', () => {
    expect(() => randomKey()).toThrow(expect.objectContaining({ code: 'not_ready' }));
  });
});
