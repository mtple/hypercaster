/**
 * Test helper: a `fetch` that answers from the synthetic world and records
 * every request it was asked to make.
 */
import { createApi } from '~/hypersnap/api';
import { createWorld, type World } from '~/hypersnap/fixtures/world.mjs';
import { createTransport } from '~/hypersnap/http';

type RecordedRequest = { method: string; url: string; path: string };

type Override = (
  path: string,
  query: URLSearchParams,
) => { status: number; body?: unknown; text?: string } | 'network-error' | null;

const NODE_URL = 'https://node.example';

function createFakeNode(
  options: { world?: World; writesEnabled?: boolean } = {},
) {
  const world = options.world ?? createWorld();
  const requests: RecordedRequest[] = [];
  let override: Override | null = null;

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    requests.push({ method, url: url.href, path: url.pathname });

    const overridden = override
      ? override(url.pathname, url.searchParams)
      : null;
    if (overridden === 'network-error') {
      throw new TypeError('Failed to fetch');
    }
    const result = overridden ?? world.handle(url.pathname, url.searchParams);
    const text = result.text ?? JSON.stringify(result.body);
    return new Response(text, {
      status: result.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const transport = createTransport(
    { nodeUrl: NODE_URL, writesEnabled: options.writesEnabled ?? false },
    { fetch: fetchImpl, sleep: async () => undefined, random: () => 0 },
  );

  return {
    world,
    requests,
    fetch: fetchImpl,
    transport,
    api: createApi(transport),
    /** Replace responses until cleared; return null to fall through. */
    setOverride(next: Override | null) {
      override = next;
    },
  };
}

export { createFakeNode, NODE_URL };
export type { RecordedRequest };
