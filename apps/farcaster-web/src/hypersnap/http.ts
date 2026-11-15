/**
 * The only module in Hypercast that calls fetch.
 *
 * Reads are GET requests to an allowlisted path prefix on the configured
 * node. The single write entry point, postMessage, exists only when the
 * build has writes enabled and can reach nothing but the node's message
 * submission routes.
 */
import type { HypersnapConfig } from '~/hypersnap/config';
import { HypersnapError, isRetryableKind } from '~/hypersnap/errors';
import { parseJsonLossless } from '~/hypersnap/json';

type QueryValue = string | number | boolean | null | undefined;
type Query = Record<string, QueryValue>;

type RequestOptions = {
  signal?: AbortSignal;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** Extra attempts after the first, for transient failures only. */
  retries?: number;
};

type Transport = {
  get: (
    path: string,
    query?: Query,
    options?: RequestOptions,
  ) => Promise<unknown>;
  postMessage: (
    path: WritePath,
    body: Uint8Array,
    options?: RequestOptions,
  ) => Promise<unknown>;
};

type TransportDeps = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

type WritePath = '/v1/submitMessage' | '/v1/validateMessage';

const READ_PREFIXES = ['/v2/farcaster/', '/v1/'] as const;
const WRITE_PATHS: readonly WritePath[] = [
  '/v1/submitMessage',
  '/v1/validateMessage',
];

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 2;
const MAX_BODY_CHARS = 8_000_000;
const BASE_BACKOFF_MS = 400;
const MAX_BACKOFF_MS = 4_000;

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function assertReadPath(path: string): void {
  const allowed =
    READ_PREFIXES.some((prefix) => path.startsWith(prefix)) &&
    !path.includes('..') &&
    !path.includes('//') &&
    !path.includes('?') &&
    !path.includes('#');
  if (!allowed) {
    throw new HypersnapError('blocked', `Refusing to request "${path}"`, {
      path,
    });
  }
}

function buildUrl(
  base: string,
  path: string,
  query: Query | undefined,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    params.set(key, String(value));
  }
  const search = params.toString();
  return `${base}${path}${search === '' ? '' : `?${search}`}`;
}

function messageFromBody(text: string): string | null {
  try {
    const body = JSON.parse(text) as Record<string, unknown> | null;
    if (body && typeof body === 'object') {
      for (const key of ['message', 'error_detail', 'details', 'error']) {
        const value = body[key];
        if (typeof value === 'string' && value !== '') {
          return value;
        }
      }
    }
  } catch {
    // Not JSON; fall through to the raw text.
  }
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed.slice(0, 300);
}

function errorForStatus(status: number, path: string, text: string) {
  const detail = messageFromBody(text);
  if (status === 404) {
    return new HypersnapError('not_found', detail ?? 'Not found', {
      status,
      path,
    });
  }
  if (status === 429) {
    return new HypersnapError(
      'rate_limited',
      detail ?? 'The node is limiting requests',
      { status, path },
    );
  }
  if (status >= 500) {
    return new HypersnapError('server', detail ?? `Node error (${status})`, {
      status,
      path,
    });
  }
  return new HypersnapError(
    'bad_request',
    detail ?? `Request rejected (${status})`,
    { status, path },
  );
}

function createTransport(
  config: Pick<HypersnapConfig, 'nodeUrl' | 'writesEnabled'>,
  deps: TransportDeps = {},
): Transport {
  const doFetch = deps.fetch ?? ((...args) => globalThis.fetch(...args));
  const sleep = deps.sleep ?? defaultSleep;
  const random = deps.random ?? Math.random;

  async function attempt(
    url: string,
    path: string,
    init: RequestInit,
    options: RequestOptions,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onCallerAbort = () => controller.abort();
    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener('abort', onCallerAbort, { once: true });
      }
    }

    try {
      let response: Response;
      let text: string;
      try {
        response = await doFetch(url, {
          ...init,
          signal: controller.signal,
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
        });
        text = await response.text();
      } catch (cause) {
        if (options.signal?.aborted) {
          throw new HypersnapError('aborted', 'Request cancelled', {
            path,
            cause,
          });
        }
        if (timedOut) {
          throw new HypersnapError(
            'timeout',
            `The node did not answer within ${Math.round(timeoutMs / 1000)}s`,
            { path, cause },
          );
        }
        throw new HypersnapError('network', 'Could not reach the node', {
          path,
          cause,
        });
      }

      if (!response.ok) {
        throw errorForStatus(response.status, path, text);
      }
      if (text.length > MAX_BODY_CHARS) {
        throw new HypersnapError('malformed', 'Response too large', {
          status: response.status,
          path,
        });
      }
      try {
        return parseJsonLossless(text);
      } catch (cause) {
        throw new HypersnapError('malformed', 'The node sent invalid JSON', {
          status: response.status,
          path,
          cause,
        });
      }
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onCallerAbort);
    }
  }

  async function withRetries(
    run: () => Promise<unknown>,
    retries: number,
    signal: AbortSignal | undefined,
  ): Promise<unknown> {
    let lastError: unknown;
    for (let tryIndex = 0; tryIndex <= retries; tryIndex += 1) {
      try {
        return await run();
      } catch (error) {
        lastError = error;
        const retryable =
          error instanceof HypersnapError && isRetryableKind(error.kind);
        if (!retryable || tryIndex === retries || signal?.aborted) {
          throw error;
        }
        const ceiling = Math.min(
          MAX_BACKOFF_MS,
          BASE_BACKOFF_MS * 2 ** tryIndex,
        );
        // Full jitter: anywhere between half the ceiling and the ceiling.
        await sleep(Math.round(ceiling / 2 + random() * (ceiling / 2)));
      }
    }
    throw lastError;
  }

  return {
    get(path, query, options = {}) {
      assertReadPath(path);
      const url = buildUrl(config.nodeUrl, path, query);
      return withRetries(
        () =>
          attempt(
            url,
            path,
            { method: 'GET', headers: { accept: 'application/json' } },
            options,
          ),
        options.retries ?? DEFAULT_RETRIES,
        options.signal,
      );
    },

    postMessage(path, body, options = {}) {
      if (!config.writesEnabled) {
        throw new HypersnapError(
          'blocked',
          'This build is read-only; nothing can be submitted',
          { path },
        );
      }
      if (!WRITE_PATHS.includes(path)) {
        throw new HypersnapError('blocked', `Refusing to post to "${path}"`, {
          path,
        });
      }
      const url = `${config.nodeUrl}${path}`;
      // A signed message is identified by its hash, so resending the same
      // bytes cannot apply it twice. Callers opt in to retries explicitly.
      return withRetries(
        () =>
          attempt(
            url,
            path,
            {
              method: 'POST',
              headers: {
                accept: 'application/json',
                'content-type': 'application/octet-stream',
              },
              body: body as BodyInit,
            },
            options,
          ),
        options.retries ?? 0,
        options.signal,
      );
    },
  };
}

export { createTransport, DEFAULT_RETRIES, DEFAULT_TIMEOUT_MS };
export type { Query, RequestOptions, Transport, TransportDeps, WritePath };
