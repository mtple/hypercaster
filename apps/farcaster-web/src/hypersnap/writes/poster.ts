/**
 * The one way to send something to the node.
 *
 * It is kept apart from the read transport so that a read-only build,
 * which never imports this file, contains no code that can make a request
 * other than a GET. Even when it is included it refuses to work unless the
 * build has writes enabled, and it can reach nothing but the node's two
 * message routes.
 */
import type { HypersnapConfig } from '~/hypersnap/config';
import { HypersnapError } from '~/hypersnap/errors';
import {
  createRequester,
  type RequestOptions,
  type TransportDeps,
} from '~/hypersnap/http';

type WritePath = '/v1/submitMessage' | '/v1/validateMessage';

const WRITE_PATHS: readonly WritePath[] = [
  '/v1/submitMessage',
  '/v1/validateMessage',
];

type MessagePoster = {
  postMessage: (
    path: WritePath,
    body: Uint8Array,
    options?: RequestOptions,
  ) => Promise<unknown>;
};

function createMessagePoster(
  config: Pick<HypersnapConfig, 'nodeUrl' | 'writesEnabled'>,
  deps: TransportDeps = {},
): MessagePoster {
  const { attempt, withRetries } = createRequester(deps);
  return {
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

export { createMessagePoster };
export type { MessagePoster, WritePath };
