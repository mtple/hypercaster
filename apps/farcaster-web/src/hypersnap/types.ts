/**
 * Domain types for the Hypercast interface.
 *
 * These are view models, not wire types: normalize.ts builds them from
 * whatever a Hypersnap node actually returns.
 */

/** Farcaster ID as a decimal string. Never a JavaScript number. */
type Fid = string;

/** Cast hash: lowercase hex with a leading "0x". */
type CastHash = string;

type UserViewerContext = {
  following: boolean;
  followedBy: boolean;
};

type User = {
  fid: Fid;
  /** Empty when the account has no username on this node. */
  username: string;
  displayName: string;
  pfpUrl: string | null;
  bio: string;
  followerCount: number;
  followingCount: number;
  custodyAddress: string | null;
  registeredAt: string | null;
  verifiedEthAddresses: string[];
  verifiedSolAddresses: string[];
  /** Registered on Hypersnap itself; such accounts do not exist on Snapchain. */
  isNative: boolean;
  /**
   * False when the node answered a lookup with an empty placeholder, which
   * is how it reports an FID it has no record of.
   */
  exists: boolean;
  viewerContext: UserViewerContext | null;
};

type Embed =
  | { kind: 'image'; url: string }
  | { kind: 'video'; url: string; streaming: boolean }
  | { kind: 'link'; url: string; host: string }
  | { kind: 'cast'; fid: Fid; hash: CastHash };

type MentionSpan = {
  /** UTF-16 offsets into Cast.text. */
  start: number;
  end: number;
  fid: Fid;
  username: string;
};

type CastViewerContext = {
  liked: boolean;
  recasted: boolean;
};

type Cast = {
  hash: CastHash;
  author: User;
  /** Body with "@name" mentions restored at their original positions. */
  text: string;
  mentions: MentionSpan[];
  /** ISO-8601, or null if the node sent something unparseable. */
  timestamp: string | null;
  timestampMs: number | null;
  embeds: Embed[];
  parentHash: CastHash | null;
  parentAuthorFid: Fid | null;
  parentUrl: string | null;
  rootParentUrl: string | null;
  threadHash: CastHash | null;
  /** Channel id derived from the parent URL, when it is a channel URL. */
  channelId: string | null;
  likesCount: number;
  recastsCount: number;
  repliesCount: number;
  viewerContext: CastViewerContext | null;
};

type ConversationNode = {
  cast: Cast;
  replies: ConversationNode[];
};

type Channel = {
  id: string;
  name: string;
  url: string | null;
  parentUrl: string | null;
  memberCount: number | null;
  imageUrl: string | null;
  description: string | null;
};

type ChannelMember = {
  user: User;
  role: string;
};

type NotificationKind =
  | 'like'
  | 'recast'
  | 'quote'
  | 'reply'
  | 'mention'
  | 'follow'
  | 'unknown';

type NotificationItem = {
  kind: NotificationKind;
  actor: User;
  cast: Cast | null;
  timestamp: string | null;
  timestampMs: number | null;
};

type ReactionKind = 'like' | 'recast';

type Reaction = {
  kind: ReactionKind;
  user: User;
  castHash: CastHash;
  castAuthorFid: Fid | null;
  timestamp: string | null;
};

type Page<T> = {
  items: T[];
  /** Opaque. null means the list is finished. */
  nextCursor: string | null;
};

type NodeInfo = {
  numMessages: number | null;
  numFidRegistrations: number | null;
  shardHeights: {
    shardId: number;
    maxHeight: number;
    blockDelay: number | null;
  }[];
};

export type {
  Cast,
  CastHash,
  CastViewerContext,
  Channel,
  ChannelMember,
  ConversationNode,
  Embed,
  Fid,
  MentionSpan,
  NodeInfo,
  NotificationItem,
  NotificationKind,
  Page,
  Reaction,
  ReactionKind,
  User,
  UserViewerContext,
};
