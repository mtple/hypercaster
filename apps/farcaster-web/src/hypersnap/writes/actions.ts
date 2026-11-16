/**
 * The things a signed-in account can do, each one a single signed message.
 */
import type { CastHash, Fid } from '~/hypersnap/types';
import {
  castAddData,
  type CastDraft,
  castRemoveData,
  type CastTarget,
  farcasterTime,
  followData,
  type MessageSigner,
  reactionData,
  type ReactionName,
  signMessage,
} from '~/hypersnap/writes/messages';
import type { MessagePoster } from '~/hypersnap/writes/poster';
import { submitMessage, type SubmitOptions } from '~/hypersnap/writes/submit';

/** A node accepts timestamps up to ten minutes ahead; stay inside that. */
const MAX_SECONDS_AHEAD = 590;

type MessageClock = {
  /** Timestamp for a cast or a removal. */
  now: () => number;
  /**
   * Timestamp for a like, recast or follow, or its undo. Each is later
   * than the one before, because when an add and a remove carry the same
   * second the remove wins, and a quick like-unlike-like would be lost.
   */
  nextToggle: () => number;
};

function createClock(nowMs: () => number = Date.now): MessageClock {
  let lastToggle = 0;
  return {
    now: () => farcasterTime(nowMs()),
    nextToggle: () => {
      const now = farcasterTime(nowMs());
      lastToggle = Math.min(
        Math.max(now, lastToggle + 1),
        now + MAX_SECONDS_AHEAD,
      );
      return lastToggle;
    },
  };
}

type ActionDeps = {
  poster: MessagePoster;
  fid: Fid;
  signer: MessageSigner;
  clock: MessageClock;
  submitOptions?: SubmitOptions;
};

async function send(deps: ActionDeps, data: Uint8Array): Promise<CastHash> {
  const message = await signMessage(data, deps.signer);
  await submitMessage(deps.poster, message, deps.submitOptions);
  return message.hash;
}

/** Publishes a cast and returns its hash. */
const sendCast = (deps: ActionDeps, draft: CastDraft): Promise<CastHash> =>
  send(deps, castAddData(deps.fid, deps.clock.now(), draft));

const removeCast = (deps: ActionDeps, hash: CastHash): Promise<CastHash> =>
  send(deps, castRemoveData(deps.fid, deps.clock.now(), hash));

const setReaction = (
  deps: ActionDeps,
  reaction: ReactionName,
  target: CastTarget,
  on: boolean,
): Promise<CastHash> =>
  send(
    deps,
    reactionData(deps.fid, deps.clock.nextToggle(), reaction, target, !on),
  );

const setFollow = (
  deps: ActionDeps,
  targetFid: Fid,
  on: boolean,
): Promise<CastHash> =>
  send(deps, followData(deps.fid, deps.clock.nextToggle(), targetFid, !on));

export { createClock, removeCast, sendCast, setFollow, setReaction };
export type { ActionDeps, MessageClock };
