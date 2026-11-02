import { describe, expect, it } from 'vitest';
import { createBoxClient } from './index.ts';

describe('createBoxClient', () => {
  it('calls /v1/health', async () => {
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      urls.push(input instanceof Request ? input.url : String(input));
      return new Response(JSON.stringify({ status: 'ok', version: '1.2.3' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = createBoxClient('https://box.test', fetchImpl);
    const { data, error } = await client.GET('/v1/health');

    expect(error).toBeUndefined();
    expect(urls).toEqual(['https://box.test/v1/health']);
    expect(data?.version).toBe('1.2.3');
  });
});
