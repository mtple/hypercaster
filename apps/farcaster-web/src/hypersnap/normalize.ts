/**
 * Hypersnap JSON -> view models.
 *
 * The node's responses differ from its published docs in several places, so
 * every decoder accepts both the documented and the observed shape, drops
 * items it cannot make sense of, and throws "malformed" only when the
 * envelope itself is unrecognisable.
 */
import { HypersnapError } from '~/hypersnap/errors';
import { isNativeFid, normalizeHash, parseFid } from '~/hypersnap/ids';
import {
  channelIdFromParentUrl,
  classifyUrl,
  isBrowsableChannelId,
  safeHttpUrl,
} from '~/hypersnap/media';
import type {
  Cast,
  Channel,
  ChannelMember,
  ConversationNode,
  Embed,
  MentionSpan,
  NodeInfo,
  NotificationItem,
  NotificationKind,
  Page,
  Reaction,
  User,
} from '~/hypersnap/types';

type Json = Record<string, unknown>;

const FARCASTER_EPOCH_SECONDS = 1_609_459_200;
const MAX_CONVERSATION_DEPTH = 12;
const PLACEHOLDER_USERNAME = /^fid:\d+$/;

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): Json => (isRecord(value) ? value : {});

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const asString = (value: unknown): string =>
  typeof value === 'string' ? value : '';

/** Counts arrive as numbers; tolerate numeric strings and clamp at zero. */
function asCount(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : 0;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function malformed(what: string): HypersnapError {
  return new HypersnapError(
    'malformed',
    `The node's ${what} response was not in a recognised shape`,
  );
}

function compact<T>(values: (T | null)[]): T[] {
  return values.filter((value): value is T => value !== null);
}

// --- time -----------------------------------------------------------------

function decodeTimestamp(value: unknown): {
  iso: string | null;
  ms: number | null;
} {
  let ms: number | null = null;

  if (typeof value === 'string' && value !== '') {
    const parsed = Date.parse(value);
    ms = Number.isNaN(parsed) ? null : parsed;
  } else if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    if (value < 1_000_000_000) {
      // Seconds since the Farcaster epoch (2021-01-01).
      ms = (value + FARCASTER_EPOCH_SECONDS) * 1000;
    } else if (value < 1_000_000_000_000) {
      ms = value * 1000;
    } else {
      ms = value;
    }
  }

  if (ms === null) {
    return { iso: null, ms: null };
  }
  return { iso: new Date(ms).toISOString(), ms };
}

// --- pagination -----------------------------------------------------------

/** A list is finished when `next` is missing, empty, or has no cursor. */
function decodeNextCursor(value: unknown): string | null {
  const cursor = asRecord(value).cursor;
  if (typeof cursor === 'string' && cursor !== '') {
    return cursor;
  }
  if (typeof cursor === 'number' && Number.isFinite(cursor)) {
    return String(cursor);
  }
  return null;
}

// --- users ----------------------------------------------------------------

function decodeUser(value: unknown): User | null {
  if (!isRecord(value)) {
    return null;
  }
  const fid = parseFid(value.fid);
  if (fid === null) {
    return null;
  }

  const rawUsername = asString(value.username).trim();
  const username = PLACEHOLDER_USERNAME.test(rawUsername) ? '' : rawUsername;
  const custodyAddress = asString(value.custody_address);
  const registered = decodeTimestamp(value.registered_at);
  const verified = asRecord(value.verified_addresses);
  const viewer = isRecord(value.viewer_context) ? value.viewer_context : null;

  return {
    fid,
    username,
    displayName: asString(value.display_name).trim() || username || `!${fid}`,
    pfpUrl: safeHttpUrl(value.pfp_url),
    bio: asString(asRecord(asRecord(value.profile).bio).text),
    followerCount: asCount(value.follower_count),
    followingCount: asCount(value.following_count),
    custodyAddress: custodyAddress === '' ? null : custodyAddress,
    registeredAt: registered.iso,
    verifiedEthAddresses: asArray(verified.eth_addresses).filter(
      (entry): entry is string => typeof entry === 'string',
    ),
    verifiedSolAddresses: asArray(verified.sol_addresses).filter(
      (entry): entry is string => typeof entry === 'string',
    ),
    isNative: isNativeFid(fid),
    // An unknown FID comes back as a 200 with every identifying field empty.
    exists: !(
      username === '' &&
      custodyAddress === '' &&
      registered.iso === null
    ),
    viewerContext: viewer
      ? {
          following: viewer.following === true,
          followedBy: viewer.followed_by === true,
        }
      : null,
  };
}

/** "@name", or "!fid" for an account without a username. */
const handleOf = (user: Pick<User, 'username' | 'fid'>): string =>
  user.username !== '' ? `@${user.username}` : `!${user.fid}`;

function decodeUserEnvelope(body: unknown): User {
  const user = decodeUser(asRecord(body).user);
  if (user === null) {
    throw malformed('user');
  }
  if (!user.exists) {
    throw new HypersnapError('not_found', 'No such account on this node');
  }
  return user;
}

function decodeUsersPage(body: unknown): Page<User> {
  const record = asRecord(body);
  const source = isRecord(record.result) ? record.result : record;
  if (!Array.isArray(source.users)) {
    throw malformed('user list');
  }
  return {
    items: compact(
      source.users.map((entry) =>
        // Some list endpoints wrap each user: { object: "follower", user }.
        decodeUser(
          isRecord(entry) && isRecord(entry.user) && entry.fid === undefined
            ? entry.user
            : entry,
        ),
      ),
    ),
    nextCursor: decodeNextCursor(source.next),
  };
}

// --- cast text ------------------------------------------------------------

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * The node strips mentions out of `text` and reports where each belonged as
 * a UTF-8 byte offset. Put "@name" back, and return where each one landed
 * as UTF-16 offsets so the interface can link them.
 */
function restoreMentions(
  rawText: string,
  profiles: unknown[],
  ranges: unknown[],
): { text: string; mentions: MentionSpan[] } {
  const bytes = encoder.encode(rawText);
  const pending: { start: number; end: number; user: User }[] = [];

  for (let i = 0; i < Math.min(profiles.length, ranges.length); i += 1) {
    const user = decodeUser(profiles[i]);
    const range = asRecord(ranges[i]);
    const start = range.start;
    const end = typeof range.end === 'number' ? range.end : start;
    if (
      user === null ||
      typeof start !== 'number' ||
      typeof end !== 'number' ||
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      start > bytes.length ||
      end < start ||
      end > bytes.length
    ) {
      continue;
    }
    pending.push({ start, end, user });
  }

  if (pending.length === 0) {
    return { text: rawText, mentions: [] };
  }
  pending.sort((a, b) => a.start - b.start);

  let text = '';
  let cursor = 0;
  const mentions: MentionSpan[] = [];

  for (const mention of pending) {
    let start = Math.max(mention.start, cursor);
    // Never cut a multi-byte character in half.
    while (start > cursor && (bytes[start] & 0xc0) === 0x80) {
      start -= 1;
    }
    text += decoder.decode(bytes.subarray(cursor, start));

    const label = handleOf(mention.user);
    const existing =
      mention.end > start
        ? decoder.decode(bytes.subarray(start, mention.end))
        : '';

    if (existing.startsWith('@')) {
      // A node that leaves mentions inline: link the text that is there.
      mentions.push({
        start: text.length,
        end: text.length + existing.length,
        fid: mention.user.fid,
        username: mention.user.username,
      });
      text += existing;
      cursor = mention.end;
    } else {
      mentions.push({
        start: text.length,
        end: text.length + label.length,
        fid: mention.user.fid,
        username: mention.user.username,
      });
      text += label;
      cursor = start;
    }
  }

  text += decoder.decode(bytes.subarray(cursor));
  return { text, mentions };
}

// --- casts ----------------------------------------------------------------

function decodeEmbed(value: unknown): Embed | null {
  if (!isRecord(value)) {
    return null;
  }
  const castId = isRecord(value.cast_id)
    ? value.cast_id
    : isRecord(value.cast)
      ? {
          fid: asRecord(value.cast.author).fid,
          hash: value.cast.hash,
        }
      : null;
  if (castId) {
    const fid = parseFid(castId.fid);
    const hash = normalizeHash(castId.hash);
    return fid !== null && hash !== null ? { kind: 'cast', fid, hash } : null;
  }
  return classifyUrl(value.url);
}

function decodeCast(value: unknown): Cast | null {
  if (!isRecord(value)) {
    return null;
  }
  const hash = normalizeHash(value.hash);
  const author = decodeUser(value.author);
  if (hash === null || author === null) {
    return null;
  }

  const { text, mentions } = restoreMentions(
    asString(value.text),
    asArray(value.mentioned_profiles),
    asArray(value.mentioned_profiles_ranges),
  );
  const timestamp = decodeTimestamp(value.timestamp);
  const reactions = asRecord(value.reactions);
  const parentUrl = safeHttpUrl(value.parent_url);
  const rootParentUrl = safeHttpUrl(value.root_parent_url);
  const viewer = isRecord(value.viewer_context) ? value.viewer_context : null;
  const channelFromNode = asString(asRecord(value.channel).id);

  return {
    hash,
    author,
    text,
    mentions,
    timestamp: timestamp.iso,
    timestampMs: timestamp.ms,
    embeds: compact(asArray(value.embeds).map(decodeEmbed)),
    parentHash: normalizeHash(value.parent_hash),
    parentAuthorFid: parseFid(asRecord(value.parent_author).fid),
    parentUrl,
    rootParentUrl,
    threadHash: normalizeHash(value.thread_hash),
    channelId:
      (isBrowsableChannelId(channelFromNode) ? channelFromNode : null) ??
      channelIdFromParentUrl(parentUrl) ??
      channelIdFromParentUrl(rootParentUrl),
    likesCount: asCount(reactions.likes_count),
    recastsCount: asCount(reactions.recasts_count),
    repliesCount: asCount(asRecord(value.replies).count),
    viewerContext: viewer
      ? { liked: viewer.liked === true, recasted: viewer.recasted === true }
      : null,
  };
}

function decodeCastEnvelope(body: unknown): Cast {
  const cast = decodeCast(asRecord(body).cast);
  if (cast === null) {
    throw malformed('cast');
  }
  return cast;
}

function decodeCastsPage(body: unknown): Page<Cast> {
  const record = asRecord(body);
  const source = isRecord(record.result) ? record.result : record;
  if (!Array.isArray(source.casts)) {
    throw malformed('cast list');
  }
  return {
    items: compact(source.casts.map(decodeCast)),
    nextCursor: decodeNextCursor(source.next),
  };
}

function decodeConversationNode(
  value: unknown,
  depth: number,
): ConversationNode | null {
  if (!isRecord(value)) {
    return null;
  }
  // Observed: the cast carries `direct_replies`. Documented: { cast, replies }.
  const castValue = isRecord(value.cast) ? value.cast : value;
  const cast = decodeCast(castValue);
  if (cast === null) {
    return null;
  }
  const children = Array.isArray(castValue.direct_replies)
    ? castValue.direct_replies
    : asArray(value.replies);

  return {
    cast,
    replies:
      depth >= MAX_CONVERSATION_DEPTH
        ? []
        : compact(
            children.map((child) => decodeConversationNode(child, depth + 1)),
          ),
  };
}

function decodeConversation(body: unknown): ConversationNode {
  const record = asRecord(body);
  const root = decodeConversationNode(
    isRecord(record.conversation) ? record.conversation : record,
    0,
  );
  if (root === null) {
    throw malformed('conversation');
  }
  return root;
}

// --- channels -------------------------------------------------------------

function decodeChannel(value: unknown): Channel | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = asString(value.id);
  if (!isBrowsableChannelId(id)) {
    return null;
  }
  const memberCount =
    value.member_count !== undefined
      ? asCount(value.member_count)
      : value.follower_count !== undefined
        ? asCount(value.follower_count)
        : null;
  const description = asString(value.description).trim();

  return {
    id: id.toLowerCase(),
    name: asString(value.name).trim() || id,
    url: safeHttpUrl(value.url),
    parentUrl: safeHttpUrl(value.parent_url),
    memberCount,
    imageUrl: safeHttpUrl(value.image_url),
    description: description === '' ? null : description,
  };
}

function decodeChannelEnvelope(body: unknown): Channel {
  const channel = decodeChannel(asRecord(body).channel);
  if (channel === null) {
    throw malformed('channel');
  }
  return channel;
}

function decodeChannelsPage(body: unknown): Page<Channel> {
  const record = asRecord(body);
  if (!Array.isArray(record.channels)) {
    throw malformed('channel list');
  }
  return {
    items: compact(record.channels.map(decodeChannel)),
    nextCursor: decodeNextCursor(record.next),
  };
}

function decodeChannelMembersPage(body: unknown): Page<ChannelMember> {
  const record = asRecord(body);
  const entries = Array.isArray(record.members)
    ? record.members
    : Array.isArray(record.users)
      ? record.users
      : null;
  if (entries === null) {
    throw malformed('channel member list');
  }
  return {
    items: compact(
      entries.map((entry) => {
        const wrapped = isRecord(entry) && isRecord(entry.user);
        const user = decodeUser(wrapped ? (entry as Json).user : entry);
        return user === null
          ? null
          : { user, role: wrapped ? asString((entry as Json).role) : '' };
      }),
    ),
    nextCursor: decodeNextCursor(record.next),
  };
}

// --- notifications and reactions -----------------------------------------

const NOTIFICATION_KINDS: Record<string, NotificationKind> = {
  // Observed on the live node.
  likes: 'like',
  recasts: 'recast',
  quote: 'quote',
  reply: 'reply',
  mention: 'mention',
  follows: 'follow',
  // Names used by the published docs.
  'cast-reply': 'reply',
  'cast-mention': 'mention',
  reaction: 'like',
  follow: 'follow',
};

function decodeNotificationsPage(body: unknown): Page<NotificationItem> {
  const record = asRecord(body);
  if (!Array.isArray(record.notifications)) {
    throw malformed('notification');
  }

  const items: NotificationItem[] = [];
  for (const entry of record.notifications) {
    if (!isRecord(entry)) {
      continue;
    }
    const kind = NOTIFICATION_KINDS[asString(entry.type)] ?? 'unknown';
    const cast = decodeCast(entry.cast);
    const timestamp = decodeTimestamp(
      entry.timestamp ?? entry.most_recent_timestamp,
    );
    const base = {
      kind,
      cast,
      timestamp: timestamp.iso,
      timestampMs: timestamp.ms,
    };

    // Observed: one row per actor in `user`. Documented: aggregate arrays.
    const actors = [
      entry.user,
      ...asArray(entry.follows).map((follow) => asRecord(follow).user),
      ...asArray(entry.reactions).map((reaction) => asRecord(reaction).user),
    ];
    let matched = false;
    for (const candidate of actors) {
      const actor = decodeUser(candidate);
      if (actor !== null) {
        items.push({ ...base, actor });
        matched = true;
      }
    }
    // A reply or mention with no separate `user` is authored by the cast's author.
    if (!matched && cast !== null) {
      items.push({ ...base, actor: cast.author });
    }
  }

  return { items, nextCursor: decodeNextCursor(record.next) };
}

function decodeReactionsPage(body: unknown): Page<Reaction> {
  const record = asRecord(body);
  if (!Array.isArray(record.reactions)) {
    throw malformed('reaction');
  }
  return {
    items: compact(
      record.reactions.map((entry) => {
        if (!isRecord(entry)) {
          return null;
        }
        const user = decodeUser(entry.user);
        const castStub = asRecord(entry.cast);
        const castHash = normalizeHash(castStub.hash);
        if (user === null || castHash === null) {
          return null;
        }
        const type = asString(entry.reaction_type);
        return {
          kind: type === 'recast' || type === 'recasts' ? 'recast' : 'like',
          user,
          castHash,
          castAuthorFid:
            parseFid(castStub.fid) ?? parseFid(asRecord(castStub.author).fid),
          timestamp: decodeTimestamp(
            entry.reaction_timestamp ?? entry.timestamp,
          ).iso,
        } satisfies Reaction;
      }),
    ),
    nextCursor: decodeNextCursor(record.next),
  };
}

// --- node -----------------------------------------------------------------

function decodeNodeInfo(body: unknown): NodeInfo {
  const record = asRecord(body);
  const stats = asRecord(record.dbStats);
  const toNumber = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;
  return {
    numMessages: toNumber(stats.numMessages),
    numFidRegistrations: toNumber(stats.numFidRegistrations),
    shardHeights: compact(
      asArray(record.shardInfos).map((entry) => {
        const shard = asRecord(entry);
        const shardId = toNumber(shard.shardId);
        const maxHeight = toNumber(shard.maxHeight);
        return shardId === null || maxHeight === null
          ? null
          : { shardId, maxHeight, blockDelay: toNumber(shard.blockDelay) };
      }),
    ),
  };
}

export {
  decodeCast,
  decodeCastEnvelope,
  decodeCastsPage,
  decodeChannel,
  decodeChannelEnvelope,
  decodeChannelMembersPage,
  decodeChannelsPage,
  decodeConversation,
  decodeNextCursor,
  decodeNodeInfo,
  decodeNotificationsPage,
  decodeReactionsPage,
  decodeTimestamp,
  decodeUser,
  decodeUserEnvelope,
  decodeUsersPage,
  handleOf,
  restoreMentions,
};
