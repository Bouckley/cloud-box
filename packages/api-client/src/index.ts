import createClient, { type Client } from 'openapi-fetch';
import type { paths } from './schema.ts';

export type { components, paths } from './schema.ts';

/** A typed client for boxd. The contract is api/openapi.yaml. */
export function createBoxClient(baseUrl: string, fetchImpl?: typeof fetch): Client<paths> {
  return createClient<paths>(fetchImpl ? { baseUrl, fetch: fetchImpl } : { baseUrl });
}
