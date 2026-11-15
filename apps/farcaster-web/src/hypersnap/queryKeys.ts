/**
 * React Query keys. Every key starts with the node it was read from, and
 * every viewer-dependent key carries the viewer, so switching node or
 * account can never surface another scope's cached data.
 */
import { config } from '~/hypersnap/config';
import type { CastHash, Fid, ReactionKind } from '~/hypersnap/types';

const root = ['hypersnap', config.nodeUrl] as const;
const viewerPart = (viewerFid: Fid | null) => `viewer:${viewerFid ?? 'none'}`;

const queryKeys = {
  root,
  /** Everything read on behalf of one FID: its feed and notifications. */
  subject: (fid: Fid) => [...root, 'subject', fid] as const,

  trending: (viewerFid: Fid | null) =>
    [...root, 'feed', 'trending', viewerPart(viewerFid)] as const,
  following: (fid: Fid, viewerFid: Fid | null) =>
    [...root, 'subject', fid, 'following-feed', viewerPart(viewerFid)] as const,
  notifications: (fid: Fid) =>
    [...root, 'subject', fid, 'notifications'] as const,
  suggested: (fid: Fid) => [...root, 'subject', fid, 'suggested'] as const,

  userCasts: (fid: Fid, tab: 'casts' | 'replies' | 'likes', viewerFid: Fid | null) =>
    [...root, 'user', fid, tab, viewerPart(viewerFid)] as const,
  userByFid: (fid: Fid, viewerFid: Fid | null) =>
    [...root, 'user', fid, 'profile', viewerPart(viewerFid)] as const,
  userByUsername: (username: string, viewerFid: Fid | null) =>
    [...root, 'username', username.toLowerCase(), viewerPart(viewerFid)] as const,
  followers: (fid: Fid, viewerFid: Fid | null) =>
    [...root, 'user', fid, 'followers', viewerPart(viewerFid)] as const,
  followingList: (fid: Fid, viewerFid: Fid | null) =>
    [...root, 'user', fid, 'following', viewerPart(viewerFid)] as const,

  conversation: (hash: CastHash, viewerFid: Fid | null) =>
    [...root, 'cast', hash, 'conversation', viewerPart(viewerFid)] as const,
  castByPrefix: (username: string, prefix: string) =>
    [...root, 'cast-prefix', username.toLowerCase(), prefix.toLowerCase()] as const,
  castReactions: (hash: CastHash, kind: ReactionKind) =>
    [...root, 'cast', hash, 'reactions', kind] as const,
  quotes: (hash: CastHash, viewerFid: Fid | null) =>
    [...root, 'cast', hash, 'quotes', viewerPart(viewerFid)] as const,
  castsByHash: (hashes: CastHash[], viewerFid: Fid | null) =>
    [...root, 'casts', hashes.join(','), viewerPart(viewerFid)] as const,

  channel: (id: string) => [...root, 'channel', id.toLowerCase()] as const,
  channelFeed: (id: string, viewerFid: Fid | null) =>
    [...root, 'channel', id.toLowerCase(), 'feed', viewerPart(viewerFid)] as const,
  channelMembers: (id: string) =>
    [...root, 'channel', id.toLowerCase(), 'members'] as const,
  trendingChannels: () => [...root, 'channels', 'trending'] as const,

  searchCasts: (query: string, viewerFid: Fid | null) =>
    [...root, 'search', 'casts', query, viewerPart(viewerFid)] as const,
  searchUsers: (query: string, viewerFid: Fid | null) =>
    [...root, 'search', 'users', query, viewerPart(viewerFid)] as const,
  searchChannels: (query: string) =>
    [...root, 'search', 'channels', query] as const,

  nodeInfo: () => [...root, 'node-info'] as const,
};

export { queryKeys };
