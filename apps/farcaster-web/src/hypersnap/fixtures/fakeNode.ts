/**
 * Test helper: a `fetch` that answers from the synthetic world and records
 * every request it was asked to make.
 */
import { createApi } from '~/hypersnap/api';
import { createWorld, type World } from '~/hypersnap/fixtures/world.mjs';
import { createTransport } from '~/hypersnap/http';
import { createMessagePoster } from '~/hypersnap/writes/poster';

type RecordedRequest = { method: string; url: string; path: string };

type Submission = {
  path: string;
  bytes: Uint8Array;
  contentType: string | null;
};

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
  const submissions: Submission[] = [];
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
    const isSubmission =
      method === 'POST' &&
      (url.pathname === '/v1/submitMessage' ||
        url.pathname === '/v1/validateMessage');
    if (isSubmission) {
      submissions.push({
        path: url.pathname,
        bytes: new Uint8Array(init?.body as ArrayBuffer),
        contentType: new Headers(init?.headers).get('content-type'),
      });
    }
    const result: { status: number; body?: unknown; text?: string } =
      overridden ??
      (isSubmission
        ? await world.submit(new Uint8Array(init?.body as ArrayBuffer), {
            validateOnly: url.pathname === '/v1/validateMessage',
          })
        : world.handle(url.pathname, url.searchParams));
    const text = result.text ?? JSON.stringify(result.body);
    return new Response(text, {
      status: result.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const deps = {
    fetch: fetchImpl,
    sleep: async () => undefined,
    random: () => 0,
  };
  const nodeConfig = {
    nodeUrl: NODE_URL,
    writesEnabled: options.writesEnabled ?? false,
  };
  const transport = createTransport(nodeConfig, deps);

  return {
    world,
    requests,
    /** Every message the client tried to submit, accepted or not. */
    submissions,
    fetch: fetchImpl,
    transport,
    /** Refuses to submit unless created with writesEnabled. */
    poster: createMessagePoster(nodeConfig, deps),
    api: createApi(transport),
    /** Replace responses until cleared; return null to fall through. */
    setOverride(next: Override | null) {
      override = next;
    },
  };
}

export { createFakeNode, NODE_URL };
export type { RecordedRequest, Submission };
