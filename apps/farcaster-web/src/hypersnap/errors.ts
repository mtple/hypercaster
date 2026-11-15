type HypersnapErrorKind =
  /** The node rejected the request as malformed (HTTP 400). */
  | 'bad_request'
  /** The node has no such record (HTTP 404), or returned an empty placeholder. */
  | 'not_found'
  /** HTTP 429. */
  | 'rate_limited'
  /** HTTP 5xx. */
  | 'server'
  /** The request never produced a response (offline, DNS, CORS, TLS). */
  | 'network'
  | 'timeout'
  /** Cancelled by the caller; never shown to people. */
  | 'aborted'
  /** A 2xx response that is not the JSON shape this client understands. */
  | 'malformed'
  /** Refused locally before any request was made. */
  | 'blocked';

class HypersnapError extends Error {
  readonly kind: HypersnapErrorKind;
  readonly status: number | null;
  readonly path: string;

  constructor(
    kind: HypersnapErrorKind,
    message: string,
    options: { status?: number | null; path?: string; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'HypersnapError';
    this.kind = kind;
    this.status = options.status ?? null;
    this.path = options.path ?? '';
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

const isHypersnapError = (error: unknown): error is HypersnapError =>
  error instanceof HypersnapError;

const isNotFound = (error: unknown): boolean =>
  isHypersnapError(error) && error.kind === 'not_found';

const isRetryableKind = (kind: HypersnapErrorKind): boolean =>
  kind === 'network' ||
  kind === 'timeout' ||
  kind === 'rate_limited' ||
  kind === 'server';

export { HypersnapError, isHypersnapError, isNotFound, isRetryableKind };
export type { HypersnapErrorKind };
