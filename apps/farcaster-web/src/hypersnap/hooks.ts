/**
 * Data hooks. Components never call the API directly; they use these, which
 * add caching, cursor handling, de-duplication and viewer scoping.
 */
import {
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query';
import { useMemo } from 'react';

import { api } from '~/hypersnap/client';
import { HypersnapError, isHypersnapError } from '~/hypersnap/errors';
import { normalizeHash, normalizeHashPrefix, parseFid } from '~/hypersnap/ids';
import { queryKeys } from '~/hypersnap/queryKeys';
import { useSession, viewerFidOf } from '~/hypersnap/session';
import type {
  Cast,
  CastHash,
  Channel,
  ChannelMember,
  ConversationNode,
  Fid,
  NotificationItem,
  Page,
  ReactionKind,
  User,
} from '~/hypersnap/types';

const SECOND = 1000;
const FEED_STALE_MS = 30 * SECOND;
const PROFILE_STALE_MS = 60 * SECOND;
const NOTIFICATIONS_STALE_MS = 30 * SECOND;
const CAST_STALE_MS = 5 * 60 * SECOND;
const CHANNEL_STALE_MS = 5 * 60 * SECOND;
const MAX_ANCESTORS = 8;

/** Quoted casts referenced by a page, fetched alongside it. */
type QuotedCasts = Record<CastHash, Cast>;
type CastPage = Page<Cast> & { quoted: QuotedCasts };

function quotedHashesOf(casts: Cast[]): CastHash[] {
  const known = new Set(casts.map((cast) => cast.hash));
  const wanted = new Set<CastHash>();
  for (const cast of casts) {
    for (const embed of cast.embeds) {
      if (embed.kind === 'cast' && !known.has(embed.hash)) {
        wanted.add(embed.hash);
      }
    }
  }
  return [...wanted];
}

/**
 * Embedded casts arrive as bare references. Resolve all of a page's
 * references in a single bulk request. A failure here is not fatal: the
 * page still renders, with the quote shown as unavailable.
 */
async function loadQuoted(
  casts: Cast[],
  viewerFid: Fid | null,
  signal: AbortSignal | undefined,
): Promise<QuotedCasts> {
  const quoted: QuotedCasts = {};
  for (const cast of casts) {
    quoted[cast.hash] = cast;
  }
  const hashes = quotedHashesOf(casts);
  if (hashes.length === 0) {
    return quoted;
  }
  try {
    const fetched = await api.getCastsByHashes(hashes, { viewerFid }, { signal });
    for (const cast of fetched) {
      quoted[cast.hash] = cast;
    }
  } catch (error) {
    if (isHypersnapError(error) && error.kind === 'aborted') {
      throw error;
    }
  }
  return quoted;
}

async function withQuoted(
  page: Page<Cast>,
  viewerFid: Fid | null,
  signal: AbortSignal | undefined,
): Promise<CastPage> {
  return { ...page, quoted: await loadQuoted(page.items, viewerFid, signal) };
}

/**
 * Cursor rule shared by every list: stop when the node says so, and also
 * when it hands back a cursor we have already used.
 */
function nextCursorOrStop<T>(
  lastPage: Page<T>,
  _allPages: Page<T>[],
  lastParam: string | null,
  allParams: (string | null)[],
): string | undefined {
  const cursor = lastPage.nextCursor;
  if (cursor === null || cursor === lastParam || allParams.includes(cursor)) {
    return undefined;
  }
  // An empty page with a cursor would otherwise loop forever.
  if (lastPage.items.length === 0) {
    return undefined;
  }
  return cursor;
}

function dedupe<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

type FetchCastPage = (
  cursor: string | null,
  signal: AbortSignal,
) => Promise<Page<Cast>>;

function useCastFeed(
  queryKey: readonly unknown[],
  fetchPage: FetchCastPage,
  options: { enabled?: boolean; staleTime?: number } = {},
) {
  const viewerFid = viewerFidOf(useSession());
  const query = useInfiniteQuery<
    CastPage,
    Error,
    InfiniteData<CastPage, string | null>,
    readonly unknown[],
    string | null
  >({
    queryKey,
    initialPageParam: null,
    queryFn: async ({ pageParam, signal }) =>
      withQuoted(await fetchPage(pageParam, signal), viewerFid, signal),
    getNextPageParam: nextCursorOrStop,
    enabled: options.enabled ?? true,
    staleTime: options.staleTime ?? FEED_STALE_MS,
  });

  const casts = useMemo(
    () =>
      dedupe(query.data?.pages.flatMap((page) => page.items) ?? [], (cast) => cast.hash),
    [query.data],
  );
  const quoted = useMemo(
    () => Object.assign({}, ...(query.data?.pages.map((page) => page.quoted) ?? [])) as QuotedCasts,
    [query.data],
  );

  return { ...query, casts, quoted };
}

function useCursorList<T>(
  queryKey: readonly unknown[],
  fetchPage: (cursor: string | null, signal: AbortSignal) => Promise<Page<T>>,
  keyOf: (item: T) => string,
  options: { enabled?: boolean; staleTime?: number } = {},
) {
  const query = useInfiniteQuery<
    Page<T>,
    Error,
    InfiniteData<Page<T>, string | null>,
    readonly unknown[],
    string | null
  >({
    queryKey,
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) => fetchPage(pageParam, signal),
    getNextPageParam: nextCursorOrStop,
    enabled: options.enabled ?? true,
    staleTime: options.staleTime ?? FEED_STALE_MS,
  });

  const items = useMemo(
    () => dedupe(query.data?.pages.flatMap((page) => page.items) ?? [], keyOf),
    // keyOf is a stable module-level function at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query.data],
  );

  return { ...query, items };
}

const useViewerFid = (): Fid | null => viewerFidOf(useSession());

// --- feeds ----------------------------------------------------------------

function useTrendingFeed() {
  const viewerFid = useViewerFid();
  return useCastFeed(queryKeys.trending(viewerFid), (cursor, signal) =>
    api.getTrendingFeed({ cursor, viewerFid }, { signal }),
  );
}

function useFollowingFeed(fid: Fid | null) {
  const viewerFid = useViewerFid();
  return useCastFeed(
    queryKeys.following(fid ?? '0', viewerFid),
    (cursor, signal) =>
      api.getFollowingFeed(fid as Fid, { cursor, viewerFid }, { signal }),
    { enabled: fid !== null },
  );
}

function useUserCasts(fid: Fid | null, tab: 'casts' | 'replies') {
  const viewerFid = useViewerFid();
  return useCastFeed(
    queryKeys.userCasts(fid ?? '0', tab, viewerFid),
    (cursor, signal) =>
      tab === 'casts'
        ? api.getUserCasts(fid as Fid, { cursor, viewerFid }, { signal })
        : api.getUserReplies(fid as Fid, { cursor, viewerFid }, { signal }),
    { enabled: fid !== null },
  );
}

function useChannelFeed(channelId: string) {
  const viewerFid = useViewerFid();
  return useCastFeed(queryKeys.channelFeed(channelId, viewerFid), (cursor, signal) =>
    api.getChannelFeed(channelId, { cursor, viewerFid }, { signal }),
  );
}

function useCastSearch(query: string) {
  const viewerFid = useViewerFid();
  return useCastFeed(
    queryKeys.searchCasts(query, viewerFid),
    (cursor, signal) => api.searchCasts(query, { cursor, viewerFid }, { signal }),
    { enabled: query !== '' },
  );
}

function useQuotes(hash: CastHash) {
  const viewerFid = useViewerFid();
  return useCastFeed(queryKeys.quotes(hash, viewerFid), (cursor, signal) =>
    api.getQuotes(hash, { cursor, viewerFid }, { signal }),
  );
}

/** Casts a user has liked. The node offers no cursor here: one page only. */
function useUserLikes(fid: Fid | null) {
  const viewerFid = useViewerFid();
  return useQuery({
    queryKey: queryKeys.userCasts(fid ?? '0', 'likes', viewerFid),
    queryFn: async ({ signal }) => {
      const casts = await api.getUserReactionCasts(fid as Fid, 'like', { viewerFid }, { signal });
      return { casts, quoted: await loadQuoted(casts, viewerFid, signal) };
    },
    enabled: fid !== null,
    staleTime: FEED_STALE_MS,
  });
}

/** Specific casts by hash, in the order asked for. Used by bookmarks. */
function useCastsByHash(hashes: CastHash[]) {
  const viewerFid = useViewerFid();
  return useQuery({
    queryKey: queryKeys.castsByHash(hashes, viewerFid),
    queryFn: async ({ signal }) => {
      const found: Cast[] = [];
      for (let i = 0; i < hashes.length; i += 100) {
        found.push(
          ...(await api.getCastsByHashes(hashes.slice(i, i + 100), { viewerFid }, { signal })),
        );
      }
      const byHash = new Map(found.map((cast) => [cast.hash, cast]));
      const casts = hashes
        .map((hash) => byHash.get(hash))
        .filter((cast): cast is Cast => cast !== undefined);
      return {
        casts,
        missing: hashes.length - casts.length,
        quoted: await loadQuoted(casts, viewerFid, signal),
      };
    },
    enabled: hashes.length > 0,
    staleTime: CAST_STALE_MS,
  });
}

// --- conversation ---------------------------------------------------------

type ConversationView = {
  /** Oldest first; the last one is the focused cast's direct parent. */
  ancestors: Cast[];
  /** True when the chain above was cut short or a parent is missing. */
  ancestorsIncomplete: boolean;
  root: ConversationNode;
  quoted: QuotedCasts;
};

function flattenConversation(node: ConversationNode, into: Cast[] = []): Cast[] {
  into.push(node.cast);
  node.replies.forEach((reply) => flattenConversation(reply, into));
  return into;
}

async function fetchConversation(
  hash: CastHash,
  viewerFid: Fid | null,
  signal: AbortSignal,
): Promise<ConversationView> {
  const root = await api.getConversation(hash, { viewerFid }, { signal });

  const ancestors: Cast[] = [];
  let ancestorsIncomplete = false;
  let parentHash = root.cast.parentHash;
  const visited = new Set<CastHash>([root.cast.hash]);

  while (parentHash !== null) {
    if (ancestors.length >= MAX_ANCESTORS || visited.has(parentHash)) {
      ancestorsIncomplete = true;
      break;
    }
    visited.add(parentHash);
    try {
      const parent: Cast = await api.getCast(parentHash, { viewerFid }, { signal });
      ancestors.unshift(parent);
      parentHash = parent.parentHash;
    } catch (error) {
      if (isHypersnapError(error) && error.kind === 'aborted') {
        throw error;
      }
      // The reply is here but its parent is not on this node.
      ancestorsIncomplete = true;
      break;
    }
  }

  const quoted = await loadQuoted(
    [...ancestors, ...flattenConversation(root)],
    viewerFid,
    signal,
  );
  return { ancestors, ancestorsIncomplete, root, quoted };
}

function useConversation(hash: CastHash | null) {
  const viewerFid = useViewerFid();
  return useQuery({
    queryKey: queryKeys.conversation(hash ?? '0x', viewerFid),
    queryFn: ({ signal }) => fetchConversation(hash as CastHash, viewerFid, signal),
    enabled: hash !== null,
    staleTime: FEED_STALE_MS,
  });
}

/**
 * Turns the hash in a URL into a full cast hash: used as is when complete,
 * otherwise found by scanning the named author's recent casts.
 */
function useResolvedCastHash(username: string | undefined, hashParam: string | undefined) {
  const full = normalizeHash(hashParam);
  const prefix = normalizeHashPrefix(hashParam);
  const needsScan = full === null && prefix !== null && !!username;

  const scan = useQuery({
    queryKey: queryKeys.castByPrefix(username ?? '', prefix ?? ''),
    queryFn: async ({ signal }) => {
      const author = await api.getUserByUsername(username as string, {}, { signal });
      const cast = await api.findCastByHashPrefix(author.fid, prefix as string, {}, { signal });
      if (cast === null) {
        throw new HypersnapError(
          'not_found',
          'That cast is not among this account’s recent casts on this node',
        );
      }
      return cast.hash;
    },
    enabled: needsScan,
    staleTime: CAST_STALE_MS,
  });

  if (full !== null) {
    return { hash: full, isPending: false, error: null as Error | null, refetch: scan.refetch };
  }
  if (!needsScan) {
    return {
      hash: null,
      isPending: false,
      error: new HypersnapError('not_found', 'That is not a cast link') as Error,
      refetch: scan.refetch,
    };
  }
  return {
    hash: scan.data ?? null,
    isPending: scan.isPending,
    error: scan.error,
    refetch: scan.refetch,
  };
}

function useCastReactions(hash: CastHash, kind: ReactionKind) {
  return useQuery({
    queryKey: queryKeys.castReactions(hash, kind),
    queryFn: ({ signal }) => api.getCastReactions(hash, kind, {}, { signal }),
    staleTime: FEED_STALE_MS,
  });
}

// --- users ----------------------------------------------------------------

function useUserByFid(fid: Fid | null) {
  const viewerFid = useViewerFid();
  return useQuery({
    queryKey: queryKeys.userByFid(fid ?? '0', viewerFid),
    queryFn: ({ signal }) => api.getUserByFid(fid as Fid, { viewerFid }, { signal }),
    enabled: fid !== null,
    staleTime: PROFILE_STALE_MS,
  });
}

function useUserByUsername(username: string | null) {
  const viewerFid = useViewerFid();
  return useQuery({
    queryKey: queryKeys.userByUsername(username ?? '', viewerFid),
    queryFn: ({ signal }) =>
      api.getUserByUsername(username as string, { viewerFid }, { signal }),
    enabled: username !== null && username !== '',
    staleTime: PROFILE_STALE_MS,
  });
}

/** A profile addressed either way: "/~/profiles/:fid" or "/:username". */
function useProfile(target: { fid: string | undefined; username: string | undefined }) {
  const fid = target.fid !== undefined ? parseFid(target.fid) : null;
  const byFid = useUserByFid(fid);
  const byUsername = useUserByUsername(
    target.fid === undefined ? (target.username ?? null) : null,
  );

  if (target.fid !== undefined) {
    if (fid === null) {
      return {
        ...byFid,
        data: undefined,
        isPending: false,
        error: new HypersnapError('not_found', 'That is not an FID') as Error,
      };
    }
    return byFid;
  }
  return byUsername;
}

const userKey = (user: User) => user.fid;

function useFollowers(fid: Fid) {
  const viewerFid = useViewerFid();
  return useCursorList(
    queryKeys.followers(fid, viewerFid),
    (cursor, signal) => api.getFollowers(fid, { cursor, limit: 50, viewerFid }, { signal }),
    userKey,
    { staleTime: PROFILE_STALE_MS },
  );
}

function useFollowingList(fid: Fid) {
  const viewerFid = useViewerFid();
  return useCursorList(
    queryKeys.followingList(fid, viewerFid),
    (cursor, signal) => api.getFollowing(fid, { cursor, limit: 50, viewerFid }, { signal }),
    userKey,
    { staleTime: PROFILE_STALE_MS },
  );
}

function useSuggestedFollows(fid: Fid | null) {
  return useQuery({
    queryKey: queryKeys.suggested(fid ?? '0'),
    queryFn: ({ signal }) => api.getSuggestedFollows(fid as Fid, { limit: 5 }, { signal }),
    enabled: fid !== null,
    staleTime: CHANNEL_STALE_MS,
  });
}

function useUserSearch(query: string) {
  const viewerFid = useViewerFid();
  return useQuery({
    queryKey: queryKeys.searchUsers(query, viewerFid),
    queryFn: ({ signal }) => api.searchUsers(query, { limit: 30, viewerFid }, { signal }),
    enabled: query !== '',
    staleTime: FEED_STALE_MS,
  });
}

// --- channels -------------------------------------------------------------

function useChannel(channelId: string) {
  return useQuery<Channel>({
    queryKey: queryKeys.channel(channelId),
    queryFn: ({ signal }) => api.getChannel(channelId, { signal }),
    staleTime: CHANNEL_STALE_MS,
  });
}

function useTrendingChannels(limit = 10) {
  return useQuery<Channel[]>({
    queryKey: [...queryKeys.trendingChannels(), limit],
    queryFn: ({ signal }) => api.getTrendingChannels({ limit }, { signal }),
    staleTime: CHANNEL_STALE_MS,
  });
}

function useChannelSearch(query: string) {
  return useQuery<Channel[]>({
    queryKey: queryKeys.searchChannels(query),
    queryFn: ({ signal }) => api.searchChannels(query, { limit: 30 }, { signal }),
    enabled: query !== '',
    staleTime: FEED_STALE_MS,
  });
}

const memberKey = (member: ChannelMember) => member.user.fid;

function useChannelMembers(channelId: string) {
  return useCursorList(
    queryKeys.channelMembers(channelId),
    (cursor, signal) => api.getChannelMembers(channelId, { cursor, limit: 50 }, { signal }),
    memberKey,
    { staleTime: CHANNEL_STALE_MS },
  );
}

// --- notifications --------------------------------------------------------

const notificationKey = (item: NotificationItem) =>
  `${item.kind}:${item.actor.fid}:${item.cast?.hash ?? ''}:${item.timestamp ?? ''}`;

function useNotifications(fid: Fid | null) {
  return useCursorList(
    queryKeys.notifications(fid ?? '0'),
    (cursor, signal) => api.getNotifications(fid as Fid, { cursor, limit: 25 }, { signal }),
    notificationKey,
    { enabled: fid !== null, staleTime: NOTIFICATIONS_STALE_MS },
  );
}

// --- node -----------------------------------------------------------------

function useNodeInfo(enabled = true) {
  return useQuery({
    queryKey: queryKeys.nodeInfo(),
    queryFn: ({ signal }) => api.getNodeInfo({ signal }),
    enabled,
    staleTime: FEED_STALE_MS,
  });
}

/** Drops cached data read for one FID, e.g. when the viewed FID changes. */
function forgetSubject(queryClient: QueryClient, fid: Fid): void {
  queryClient.removeQueries({ queryKey: queryKeys.subject(fid) });
}

export {
  dedupe,
  fetchConversation,
  forgetSubject,
  nextCursorOrStop,
  quotedHashesOf,
  useCastFeed,
  useCastReactions,
  useCastsByHash,
  useCastSearch,
  useChannel,
  useChannelFeed,
  useChannelMembers,
  useChannelSearch,
  useConversation,
  useFollowers,
  useFollowingFeed,
  useFollowingList,
  useNodeInfo,
  useNotifications,
  useProfile,
  useQuotes,
  useResolvedCastHash,
  useSuggestedFollows,
  useTrendingChannels,
  useTrendingFeed,
  useUserByFid,
  useUserByUsername,
  useUserCasts,
  useUserLikes,
  useUserSearch,
  useViewerFid,
};
export type { CastPage, ConversationView, QuotedCasts };
