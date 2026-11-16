/**
 * Sends one signed message to the node.
 *
 * A message is identified by its hash, so sending the same bytes again is
 * harmless: the node cannot record it twice. That makes a bounded retry
 * safe when the node says it is busy. Any other refusal is final and is
 * reported as it is. A dropped connection is not retried here, because the
 * outcome is unknown. Nothing is shown as sent unless the node said so.
 */
import { isHypersnapError } from '~/hypersnap/errors';
import { WriteError } from '~/hypersnap/writes/errors';
import type { SignedMessage } from '~/hypersnap/writes/messages';
import type { MessagePoster } from '~/hypersnap/writes/poster';

const BUSY = /unavailable|mempool/i;
const DEFAULT_WAITS_MS = [1000, 2000, 4000];

type SubmitOptions = {
  waitsMs?: number[];
  sleep?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
};

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function submitMessage(
  poster: MessagePoster,
  message: SignedMessage,
  options: SubmitOptions = {},
): Promise<void> {
  const waits = options.waitsMs ?? DEFAULT_WAITS_MS;
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 0; ; attempt += 1) {
    try {
      await poster.postMessage('/v1/submitMessage', message.bytes, {
        retries: 0,
        signal: options.signal,
      });
      return;
    } catch (error) {
      if (!isHypersnapError(error)) {
        throw error;
      }
      if (error.kind === 'aborted' || error.kind === 'blocked') {
        throw error;
      }
      const busy =
        BUSY.test(error.message) ||
        error.kind === 'rate_limited' ||
        error.status === 503;
      if (busy && attempt < waits.length) {
        await sleep(waits[attempt]);
        continue;
      }
      if (busy) {
        throw new WriteError(
          'unavailable',
          'The node is busy and did not take this. Try again in a moment.',
        );
      }
      if (error.kind === 'network' || error.kind === 'timeout') {
        // The request may or may not have arrived. Sending the same action
        // again is safe, so say what is known and let the person decide.
        throw new WriteError(
          'unavailable',
          'The node could not be reached, so this may not have gone through. Check, then try again.',
        );
      }
      throw new WriteError(
        'refused',
        `The node did not accept this: ${error.message}`,
      );
    }
  }
}

export { submitMessage };
export type { SubmitOptions };
