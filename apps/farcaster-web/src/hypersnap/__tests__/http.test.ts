import { HypersnapError } from '~/hypersnap/errors';
import { createTransport } from '~/hypersnap/http';
import { createMessagePoster } from '~/hypersnap/writes/poster';

type Call = { url: string; init: RequestInit };

function harness(
  responses: (Response | Error | (() => Response | Promise<Response>))[],
  config = { nodeUrl: 'https://node.example', writesEnabled: false },
) {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  const queue = [...responses];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const next = queue.shift();
    if (next === undefined) {
      throw new Error('unexpected extra request');
    }
    if (next instanceof Error) {
      throw next;
    }
    return typeof next === 'function' ? next() : next;
  }) as typeof fetch;

  const deps = {
    fetch: fetchImpl,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
    random: () => 0.5,
  };
  const transport = createTransport(config, deps);
  const poster = createMessagePoster(config, deps);
  return { transport, poster, calls, sleeps };
}

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });
const status = (code: number, body: unknown = { message: `status ${code}` }) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: code,
  });

const kindOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return 'resolved';
  } catch (error) {
    return error instanceof HypersnapError
      ? error.kind
      : `other:${String(error)}`;
  }
};

describe('transport reads', () => {
  it('issues a plain GET to the configured node with no credentials', async () => {
    const { transport, calls } = harness([ok({ casts: [] })]);
    await transport.get('/v2/farcaster/feed/trending', {
      limit: 25,
      cursor: undefined,
      viewer_fid: null,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      'https://node.example/v2/farcaster/feed/trending?limit=25',
    );
    expect(calls[0].init.method).toBe('GET');
    expect(calls[0].init.credentials).toBe('omit');
    expect(calls[0].init.redirect).toBe('error');
    expect(calls[0].init.body).toBeUndefined();
    // Only a CORS-safelisted header, so browsers send no preflight.
    expect(calls[0].init.headers).toEqual({ accept: 'application/json' });
  });

  it('encodes query values', async () => {
    const { transport, calls } = harness([ok({})]);
    await transport.get('/v2/farcaster/cast/search', { q: 'a&b=c #d' });
    expect(calls[0].url).toBe(
      'https://node.example/v2/farcaster/cast/search?q=a%26b%3Dc+%23d',
    );
  });

  it('refuses paths outside the node API before any request is made', async () => {
    const { transport, calls } = harness([]);
    for (const path of [
      'https://elsewhere.example/v2/farcaster/user',
      '//elsewhere.example/v2/farcaster/user',
      '/~api/v2/me',
      '/v2/farcaster/../../admin',
      '/v2/farcaster/user?fid=3',
      '/v3/anything',
      '',
    ]) {
      // The check is synchronous so nothing can slip out first.
      expect(() => transport.get(path)).toThrowError(
        expect.objectContaining({ kind: 'blocked' }),
      );
    }
    expect(calls).toHaveLength(0);
  });

  it('supports a same-origin proxy base', async () => {
    const { transport, calls } = harness([ok({})], {
      nodeUrl: '/hs',
      writesEnabled: false,
    });
    await transport.get('/v1/info');
    expect(calls[0].url).toBe('/hs/v1/info');
  });

  it('keeps large integers exact', async () => {
    const { transport } = harness([
      new Response('{"user":{"fid":9007199254740993}}', { status: 200 }),
    ]);
    expect(
      await transport.get('/v2/farcaster/user', { fid: '9007199254740993' }),
    ).toEqual({
      user: { fid: '9007199254740993' },
    });
  });
});

describe('transport errors', () => {
  it('maps 404 to not_found and keeps the node message', async () => {
    const { transport, calls } = harness([
      status(404, { message: 'Cast not found' }),
    ]);
    await expect(transport.get('/v2/farcaster/cast')).rejects.toMatchObject({
      kind: 'not_found',
      status: 404,
      message: 'Cast not found',
    });
    expect(calls).toHaveLength(1);
  });

  it('reads v1-style error bodies and plain-text 404s', async () => {
    const v1 = harness([
      status(400, {
        error: 'Failed to get signer',
        error_detail: 'Active signer not found',
      }),
    ]);
    await expect(v1.transport.get('/v1/signer')).rejects.toMatchObject({
      kind: 'bad_request',
      message: 'Active signer not found',
    });
    const plain = harness([status(404, 'Not Found')]);
    await expect(
      plain.transport.get('/v2/farcaster/nope'),
    ).rejects.toMatchObject({
      kind: 'not_found',
      message: 'Not Found',
    });
  });

  it('does not retry 400 or 404', async () => {
    const bad = harness([status(400)]);
    expect(await kindOf(bad.transport.get('/v2/farcaster/user'))).toBe(
      'bad_request',
    );
    expect(bad.calls).toHaveLength(1);
    expect(bad.sleeps).toEqual([]);
  });

  it('retries 429 and 5xx with growing backoff, then succeeds', async () => {
    const { transport, calls, sleeps } = harness([
      status(429),
      status(503),
      ok({ fine: true }),
    ]);
    expect(await transport.get('/v2/farcaster/feed/trending')).toEqual({
      fine: true,
    });
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([300, 600]);
  });

  it('gives up after the retry budget and reports the last failure', async () => {
    const { transport, calls } = harness([
      status(500),
      status(502),
      status(503),
    ]);
    await expect(
      transport.get('/v2/farcaster/feed/trending'),
    ).rejects.toMatchObject({
      kind: 'server',
      status: 503,
    });
    expect(calls).toHaveLength(3);
  });

  it('reports rate limiting distinctly', async () => {
    const { transport } = harness([status(429), status(429), status(429)]);
    expect(await kindOf(transport.get('/v2/farcaster/feed/trending'))).toBe(
      'rate_limited',
    );
  });

  it('maps a failed fetch to network and retries it', async () => {
    const { transport, calls } = harness([
      new TypeError('Failed to fetch'),
      new TypeError('Failed to fetch'),
      new TypeError('Failed to fetch'),
    ]);
    expect(await kindOf(transport.get('/v2/farcaster/feed/trending'))).toBe(
      'network',
    );
    expect(calls).toHaveLength(3);
  });

  it('treats a 200 with invalid JSON as malformed, without retrying', async () => {
    const { transport, calls } = harness([
      new Response('<html>gateway</html>', { status: 200 }),
    ]);
    expect(await kindOf(transport.get('/v2/farcaster/feed/trending'))).toBe(
      'malformed',
    );
    expect(calls).toHaveLength(1);
  });

  it('times out a hung request', async () => {
    const hung = (signal: AbortSignal) =>
      new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    const calls: string[] = [];
    const transport = createTransport(
      { nodeUrl: 'https://node.example' },
      {
        fetch: ((input: RequestInfo | URL, init?: RequestInit) => {
          calls.push(String(input));
          return hung(init!.signal!);
        }) as typeof fetch,
        sleep: async () => undefined,
      },
    );
    await expect(
      transport.get('/v2/farcaster/feed/trending', undefined, {
        timeoutMs: 10,
        retries: 1,
      }),
    ).rejects.toMatchObject({ kind: 'timeout' });
    expect(calls).toHaveLength(2);
  });

  it('reports caller cancellation as aborted and never retries it', async () => {
    const controller = new AbortController();
    const calls: string[] = [];
    const transport = createTransport(
      { nodeUrl: 'https://node.example' },
      {
        fetch: ((input: RequestInfo | URL, init?: RequestInit) => {
          calls.push(String(input));
          return new Promise<Response>((_resolve, reject) => {
            init!.signal!.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          });
        }) as typeof fetch,
        sleep: async () => undefined,
      },
    );
    const pending = transport.get('/v2/farcaster/feed/trending', undefined, {
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ kind: 'aborted' });
    expect(calls).toHaveLength(1);
  });
});

describe('message poster', () => {
  const bytes = new Uint8Array([1, 2, 3]);

  it('cannot post anything when writes are disabled', () => {
    const { poster, calls } = harness([]);
    expect(() => poster.postMessage('/v1/submitMessage', bytes)).toThrowError(
      expect.objectContaining({ kind: 'blocked' }),
    );
    expect(calls).toHaveLength(0);
  });

  it('posts raw bytes only to the submission routes when enabled', async () => {
    const { poster, calls } = harness([ok({ hash: '0xabc' })], {
      nodeUrl: 'https://node.example',
      writesEnabled: true,
    });
    await poster.postMessage('/v1/submitMessage', bytes);
    expect(calls[0].url).toBe('https://node.example/v1/submitMessage');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.body).toBe(bytes);
    expect(calls[0].init.headers).toMatchObject({
      'content-type': 'application/octet-stream',
    });

    for (const path of [
      '/v2/farcaster/cast',
      '/v1/submitBulkMessages',
      'https://elsewhere.example/v1/submitMessage',
    ]) {
      expect(() =>
        poster.postMessage(path as '/v1/submitMessage', bytes),
      ).toThrowError(expect.objectContaining({ kind: 'blocked' }));
    }
    expect(calls).toHaveLength(1);
  });

  it('does not retry a write unless asked to', async () => {
    const { poster, calls } = harness([status(503)], {
      nodeUrl: 'https://node.example',
      writesEnabled: true,
    });
    expect(await kindOf(poster.postMessage('/v1/submitMessage', bytes))).toBe(
      'server',
    );
    expect(calls).toHaveLength(1);
  });

  it('is not part of the read transport, which can only GET', () => {
    const { transport } = harness([]);
    expect(Object.keys(transport)).toEqual(['get']);
  });
});
