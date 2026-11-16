import { describe, expect, it, vi } from 'vitest';

import { HypersnapError } from '~/hypersnap/errors';
import type { SignedMessage } from '~/hypersnap/writes/messages';
import { submitMessage } from '~/hypersnap/writes/submit';

const message: SignedMessage = {
  bytes: Uint8Array.from([1, 2, 3]),
  hash: `0x${'ab'.repeat(20)}`,
  dataBytes: Uint8Array.from([1]),
};

function posterThat(...outcomes: (HypersnapError | 'ok')[]) {
  const postMessage = vi.fn(async (..._args: unknown[]) => {
    const outcome = outcomes.shift() ?? 'ok';
    if (outcome !== 'ok') {
      throw outcome;
    }
    return {};
  });
  return { postMessage };
}

const refusal = (text: string, status = 400) =>
  new HypersnapError('bad_request', text, {
    status,
    path: '/v1/submitMessage',
  });
const sleep = vi.fn(async (_ms: number) => undefined);

describe('submitMessage', () => {
  it('posts the exact bytes once, with no transport-level retry', async () => {
    const poster = posterThat('ok');
    await submitMessage(poster, message);
    expect(poster.postMessage).toHaveBeenCalledTimes(1);
    expect(poster.postMessage).toHaveBeenCalledWith(
      '/v1/submitMessage',
      message.bytes,
      expect.objectContaining({ retries: 0 }),
    );
  });

  it('resends the same bytes while the node is busy, then succeeds', async () => {
    sleep.mockClear();
    const poster = posterThat(
      refusal('mempool is full'),
      new HypersnapError('server', 'Service Unavailable', { status: 503 }),
      'ok',
    );
    await submitMessage(poster, message, { sleep });
    expect(poster.postMessage).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000]);
    for (const call of poster.postMessage.mock.calls) {
      expect(call[1]).toBe(message.bytes);
    }
  });

  it('gives up after the waits run out and says nothing was sent', async () => {
    const poster = posterThat(
      ...Array.from({ length: 4 }, () => refusal('shard unavailable')),
    );
    await expect(
      submitMessage(poster, message, { sleep }),
    ).rejects.toMatchObject({ kind: 'unavailable' });
    expect(poster.postMessage).toHaveBeenCalledTimes(4);
  });

  it('does not retry a refusal, and passes on the node’s reason', async () => {
    const poster = posterThat(refusal('invalid signer'));
    await expect(
      submitMessage(poster, message, { sleep }),
    ).rejects.toMatchObject({
      kind: 'refused',
      message: expect.stringContaining('invalid signer'),
    });
    expect(poster.postMessage).toHaveBeenCalledTimes(1);
  });

  it('does not retry when the connection fails: the outcome is unknown', async () => {
    const poster = posterThat(new HypersnapError('network', 'Failed to fetch'));
    await expect(
      submitMessage(poster, message, { sleep }),
    ).rejects.toMatchObject({ kind: 'unavailable' });
    expect(poster.postMessage).toHaveBeenCalledTimes(1);
  });

  it('lets a read-only refusal from the transport through untouched', async () => {
    const poster = posterThat(
      new HypersnapError('blocked', 'This build is read-only'),
    );
    await expect(submitMessage(poster, message)).rejects.toMatchObject({
      kind: 'blocked',
    });
  });
});
