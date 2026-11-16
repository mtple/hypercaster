/**
 * Failures of the write path, kept apart from read failures because they
 * are shown differently: a write that did not happen must say so.
 */
type WriteErrorKind =
  /** The message could not be built from what was given. */
  | 'invalid'
  /** No wallet, or a browser that cannot create signing keys. */
  | 'unsupported'
  /** The person declined in their wallet. */
  | 'rejected'
  /** The wallet does not control an account on this node. */
  | 'no_account'
  /** The node answered and said no. */
  | 'refused'
  /** The node was busy or unreachable; nothing was accepted. */
  | 'unavailable'
  /** The signing key in this browser is gone or no longer registered. */
  | 'signed_out';

class WriteError extends Error {
  readonly kind: WriteErrorKind;

  constructor(kind: WriteErrorKind, message: string) {
    super(message);
    this.name = 'WriteError';
    this.kind = kind;
  }
}

const isWriteError = (value: unknown): value is WriteError =>
  value instanceof WriteError;

export { isWriteError, WriteError };
export type { WriteErrorKind };
