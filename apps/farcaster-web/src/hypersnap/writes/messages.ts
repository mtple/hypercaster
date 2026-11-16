/**
 * Builds and signs Farcaster protocol messages as a Hypersnap node expects
 * them on /v1/submitMessage.
 *
 * A message is a MessageData record, hashed with BLAKE3 (first 20 bytes)
 * and signed with the account's Ed25519 signing key. Nothing here talks to
 * the network; see submit.ts.
 */
import { blake3 } from '@noble/hashes/blake3.js';

import { normalizeHash, parseFid } from '~/hypersnap/ids';
import type { CastHash, Fid } from '~/hypersnap/types';
import { WriteError } from '~/hypersnap/writes/errors';
import {
  bytesField,
  concatBytes,
  fromHex,
  messageField,
  packedField,
  stringField,
  toHex,
  uintField,
  utf8,
} from '~/hypersnap/writes/proto';

/** Farcaster timestamps count seconds from 2021-01-01T00:00:00Z. */
const FARCASTER_EPOCH_SECONDS = 1_609_459_200;

const NETWORK_MAINNET = 1;
const HASH_SCHEME_BLAKE3 = 1;
const SIGNATURE_SCHEME_ED25519 = 1;
const HASH_LENGTH = 20;

const MessageType = {
  castAdd: 1,
  castRemove: 2,
  reactionAdd: 3,
  reactionRemove: 4,
  linkAdd: 5,
  linkRemove: 6,
  keyAdd: 16,
  keyRemove: 17,
} as const;
type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType];

/** Which MessageData field carries the body of each kind of message. */
const BodyField = {
  castAdd: 5,
  castRemove: 6,
  reaction: 7,
  link: 14,
  keyAdd: 19,
  keyRemove: 20,
} as const;

const ReactionType = { like: 1, recast: 2 } as const;
type ReactionName = keyof typeof ReactionType;

const CAST_TYPE_LONG = 1;
const SHORT_CAST_BYTES = 320;
const MAX_CAST_BYTES = 1024;
const MAX_EMBEDS = 2;
const MAX_MENTIONS = 10;
const MAX_URL_BYTES = 256;

type CastTarget = { fid: Fid; hash: CastHash };

type EmbedDraft = { url: string } | { cast: CastTarget };

type CastDraft = {
  /** Text with mentions already taken out; see castText.ts. */
  text: string;
  mentions: Fid[];
  /** UTF-8 byte offsets in `text`, one per mention, ascending. */
  mentionsPositions: number[];
  embeds: EmbedDraft[];
  parent?: CastTarget;
  /** Channel URL for a top-level cast in a channel. */
  parentUrl?: string;
};

/** Holds an Ed25519 key and signs with it. The key itself stays hidden. */
type MessageSigner = {
  publicKey: Uint8Array;
  sign: (payload: Uint8Array) => Promise<Uint8Array>;
};

type SignedMessage = {
  /** The full envelope, ready to send. */
  bytes: Uint8Array;
  /** The message hash; for a cast, this is the cast's hash. */
  hash: CastHash;
  dataBytes: Uint8Array;
};

function farcasterTime(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000) - FARCASTER_EPOCH_SECONDS;
}

function fidValue(fid: Fid): bigint {
  const parsed = parseFid(fid);
  if (parsed === null) {
    throw new WriteError('invalid', 'That account number is not valid');
  }
  return BigInt(parsed);
}

function hashBytes(hash: CastHash): Uint8Array {
  const normalized = normalizeHash(hash);
  if (normalized === null) {
    throw new WriteError('invalid', 'That cast hash is not valid');
  }
  return fromHex(normalized);
}

function castId(target: CastTarget): Uint8Array {
  return concatBytes([
    uintField(1, fidValue(target.fid)),
    bytesField(2, hashBytes(target.hash)),
  ]);
}

function messageData(
  type: MessageTypeValue,
  fid: Fid,
  timestamp: number,
  bodyField: number,
  body: Uint8Array,
): Uint8Array {
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new WriteError('invalid', 'The message time is not valid');
  }
  return concatBytes([
    uintField(1, type),
    uintField(2, fidValue(fid)),
    uintField(3, timestamp),
    uintField(4, NETWORK_MAINNET),
    messageField(bodyField, body),
  ]);
}

function embedBytes(embed: EmbedDraft): Uint8Array {
  if ('url' in embed) {
    if (embed.url === '' || utf8(embed.url).length > MAX_URL_BYTES) {
      throw new WriteError('invalid', 'A link in this cast is too long');
    }
    return stringField(1, embed.url);
  }
  return messageField(2, castId(embed.cast));
}

function castAddBody(draft: CastDraft): Uint8Array {
  const textBytes = utf8(draft.text).length;
  if (textBytes > MAX_CAST_BYTES) {
    throw new WriteError(
      'invalid',
      `A cast can be at most ${MAX_CAST_BYTES} bytes; this one is ${textBytes}`,
    );
  }
  if (
    textBytes === 0 &&
    draft.embeds.length === 0 &&
    draft.mentions.length === 0
  ) {
    throw new WriteError('invalid', 'A cast needs some text');
  }
  if (draft.embeds.length > MAX_EMBEDS) {
    throw new WriteError(
      'invalid',
      `A cast can carry at most ${MAX_EMBEDS} links`,
    );
  }
  if (draft.mentions.length > MAX_MENTIONS) {
    throw new WriteError(
      'invalid',
      `A cast can mention at most ${MAX_MENTIONS} accounts`,
    );
  }
  if (draft.mentions.length !== draft.mentionsPositions.length) {
    throw new WriteError(
      'invalid',
      'Mentions and their positions do not match',
    );
  }
  draft.mentionsPositions.forEach((position, index) => {
    const previous = index === 0 ? 0 : draft.mentionsPositions[index - 1];
    if (
      !Number.isInteger(position) ||
      position < previous ||
      position > textBytes
    ) {
      throw new WriteError('invalid', 'A mention is out of place');
    }
  });
  if (draft.parent && draft.parentUrl) {
    throw new WriteError(
      'invalid',
      'A cast cannot be both a reply and a channel post',
    );
  }
  if (
    draft.parentUrl !== undefined &&
    utf8(draft.parentUrl).length > MAX_URL_BYTES
  ) {
    throw new WriteError('invalid', 'The channel address is too long');
  }

  return concatBytes([
    packedField(2, draft.mentions.map(fidValue)),
    draft.parent ? messageField(3, castId(draft.parent)) : new Uint8Array(0),
    stringField(4, draft.text),
    packedField(5, draft.mentionsPositions),
    ...draft.embeds.map((embed) => messageField(6, embedBytes(embed))),
    draft.parentUrl ? stringField(7, draft.parentUrl) : new Uint8Array(0),
    uintField(8, textBytes > SHORT_CAST_BYTES ? CAST_TYPE_LONG : 0),
  ]);
}

function castAddData(
  fid: Fid,
  timestamp: number,
  draft: CastDraft,
): Uint8Array {
  return messageData(
    MessageType.castAdd,
    fid,
    timestamp,
    BodyField.castAdd,
    castAddBody(draft),
  );
}

function castRemoveData(
  fid: Fid,
  timestamp: number,
  hash: CastHash,
): Uint8Array {
  return messageData(
    MessageType.castRemove,
    fid,
    timestamp,
    BodyField.castRemove,
    bytesField(1, hashBytes(hash)),
  );
}

function reactionData(
  fid: Fid,
  timestamp: number,
  reaction: ReactionName,
  target: CastTarget,
  remove: boolean,
): Uint8Array {
  return messageData(
    remove ? MessageType.reactionRemove : MessageType.reactionAdd,
    fid,
    timestamp,
    BodyField.reaction,
    concatBytes([
      uintField(1, ReactionType[reaction]),
      messageField(2, castId(target)),
    ]),
  );
}

function followData(
  fid: Fid,
  timestamp: number,
  targetFid: Fid,
  remove: boolean,
): Uint8Array {
  if (fidValue(fid) === fidValue(targetFid)) {
    throw new WriteError('invalid', 'An account cannot follow itself');
  }
  return messageData(
    remove ? MessageType.linkRemove : MessageType.linkAdd,
    fid,
    timestamp,
    BodyField.link,
    concatBytes([stringField(1, 'follow'), uintField(3, fidValue(targetFid))]),
  );
}

/** Hashes MessageData, signs the hash, and wraps both in the envelope. */
async function signMessage(
  dataBytes: Uint8Array,
  signer: MessageSigner,
): Promise<SignedMessage> {
  const hash = blake3(dataBytes, { dkLen: HASH_LENGTH });
  const signature = await signer.sign(hash);
  if (signature.length !== 64 || signer.publicKey.length !== 32) {
    throw new WriteError(
      'invalid',
      'The signing key produced an invalid signature',
    );
  }
  return {
    bytes: concatBytes([
      messageField(1, dataBytes),
      bytesField(2, hash),
      uintField(3, HASH_SCHEME_BLAKE3),
      bytesField(4, signature),
      uintField(5, SIGNATURE_SCHEME_ED25519),
      bytesField(6, signer.publicKey),
      // Sent as well so the node hashes exactly the bytes that were signed.
      bytesField(7, dataBytes),
    ]),
    hash: `0x${toHex(hash)}`,
    dataBytes,
  };
}

export {
  BodyField,
  castAddData,
  castRemoveData,
  farcasterTime,
  fidValue,
  followData,
  MAX_CAST_BYTES,
  MAX_EMBEDS,
  MAX_MENTIONS,
  messageData,
  MessageType,
  reactionData,
  SHORT_CAST_BYTES,
  signMessage,
};
export type {
  CastDraft,
  CastTarget,
  EmbedDraft,
  MessageSigner,
  ReactionName,
  SignedMessage,
};
