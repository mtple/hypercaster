/**
 * Typed read API over a Hypersnap node. Every method is one or more GETs.
 */
import { HypersnapError, isNotFound } from '~/hypersnap/errors';
import type { RequestOptions, Transport } from '~/hypersnap/http';
import {
  normalizeHash,
  normalizeHashPrefix,
  stripHexPrefix,
} from '~/hypersnap/ids';
import {
  decodeCastEnvelope,
  decodeCastsPage,
  decodeChannelEnvelope,
  decodeChannelMembersPage,
  decodeChannelsPage,
  decodeConversation,
  decodeNodeInfo,
  decodeNotificationsPage,
  decodeReactionsPage,
  decodeUserEnvelope,
  decodeUsersPage,
} from '~/hypersnap/normalize';
import type {
  Cast,
  CastHash,
  Channel,
  ChannelMember,
  ConversationNode,
  Fid,
  NodeInfo,
  NotificationItem,
  Page,
  Reaction,
  ReactionKind,
  User,
} from '~/hypersnap/types';

/** The node silently caps `limit` at 100. */
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;
const BASE = '/v2/farcaster';

type PageParams = {
  cursor?: string | null;
  limit?: number;
  /** Adds the viewer's own like / recast / follow state to the response. */
  viewerFid?: Fid | null;
};

type CallOptions = Pick<RequestOptions, 'signal'>;

const clampLimit = (limit: number | undefined) =>
  Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(limit ?? DEFAULT_PAGE_SIZE)));

const pageQuery = (params: PageParams) => ({
  limit: clampLimit(params.limit),
  cursor: params.cursor ?? undefined,
  viewer_fid: params.viewerFid ?? undefined,
});

/** The node returns hashes without "0x" and accepts either form. */
const wireHash = (hash: CastHash) => stripHexPrefix(hash);

function requireHash(hash: string): CastHash {
  const normalized = normalizeHash(hash);
  if (normalized === null) {
    throw new HypersnapError('not_found', 'That is not a full cast hash');
  }
  return normalized;
}

function createApi(transport: Transport) {
  const get = transport.get;

  return {
    // --- feeds ---

    async getTrendingFeed(
      params: PageParams = {},
      options?: CallOptions,
    ): Promise<Page<Cast>> {
      return decodeCastsPage(
        await get(`${BASE}/feed/trending`, pageQuery(params), options),
      );
    },

    async getFollowingFeed(
      fid: Fid,
      params: PageParams = {},
      options?: CallOptions,
    ): Promise<Page<Cast>> {
      return decodeCastsPage(
        await get(
          `${BASE}/feed/following`,
          { fid, ...pageQuery(params) },
          options,
        ),
      );
    },

    async getUserCasts(
      fid: Fid,
      params: PageParams = {},
      options?: CallOptions,
    ): Promise<Page<Cast>> {
      return decodeCastsPage(
        await get(
          `${BASE}/feed/user/casts`,
          { fid, ...pageQuery(params) },
          options,
        ),
      );
    },

    async getUserReplies(
      fid: Fid,
      params: PageParams = {},
      options?: CallOptions,
    ): Promise<Page<Cast>> {
      return decodeCastsPage(
        await get(
          `${BASE}/feed/user/replies_and_recasts`,
          { fid, ...pageQuery(params) },
          options,
        ),
      );
    },

    async getChannelFeed(
      channelId: string,
      params: PageParams = {},
      options?: CallOptions,
    ): Promise<Page<Cast>> {
      return decodeCastsPage(
        await get(
          `${BASE}/feed/channels`,
          { channel_ids: channelId, ...pageQuery(params) },
          options,
        ),
      );
    },

    // --- casts ---

    async getCast(
      hash: string,
      params: { viewerFid?: Fid | null } = {},
      options?: CallOptions,
    ): Promise<Cast> {
      return decodeCastEnvelope(
        await get(
          `${BASE}/cast`,
          {
            identifier: wireHash(requireHash(hash)),
            type: 'hash',
            viewer_fid: params.viewerFid ?? undefined,
          },
          options,
        ),
      );
    },

    /** One request for up to 100 casts; unknown hashes are simply absent. */
    async getCastsByHashes(
      hashes: CastHash[],
      params: { viewerFid?: Fid | null } = {},
      options?: CallOptions,
    ): Promise<Cast[]> {
      const unique = [...new Set(hashes)].slice(0, MAX_PAGE_SIZE);
      if (unique.length === 0) {
        return [];
      }
      const page = decodeCastsPage(
        await get(
          `${BASE}/cast/bulk`,
          {
            hashes: unique.map(wireHash).join(','),
            viewer_fid: params.viewerFid ?? undefined,
          },
          options,
        ),
      );
      return page.items;
    },

    async getConversation(
      hash: string,
      params: { replyDepth?: number; viewerFid?: Fid | null } = {},
      options?: CallOptions,
    ): Promise<ConversationNode> {
      return decodeConversation(
        await get(
          `${BASE}/cast/conversation`,
          {
            identifier: wireHash(requireHash(hash)),
            type: 'hash',
            reply_depth: Math.max(0, Math.min(5, params.replyDepth ?? 3)),
            viewer_fid: params.viewerFid ?? undefined,
          },
          options,
        ),
      );
    },

    async getQuotes(
      hash: string,
      params: PageParams = {},
      options?: CallOptions,
    ): Promise<Page<Cast>> {
      return decodeCastsPage(
        await get(
          `${BASE}/cast/quotes`,
          {
            identifier: wireHash(requireHash(hash)),
            type: 'hash',
            ...pageQuery(params),
          },
          options,
        ),
      );
    },

    /**
     * Share links carry only the first bytes of a hash, which the node cannot
     * look up. Scan the author's most recent casts for a match instead, and
     * give up after `maxPages` rather than walking an entire history.
     */
    async findCastByHashPrefix(
      authorFid: Fid,
      prefix: string,
      params: { maxPages?: number; viewerFid?: Fid | null } = {},
      options?: CallOptions,
    ): Promise<Cast | null> {
      const normalized = normalizeHashPrefix(prefix);
      if (normalized === null) {
        return null;
      }
      let cursor: string | null = null;
      const seenCursors = new Set<string>();
      for (
        let pageIndex = 0;
        pageIndex < (params.maxPages ?? 3);
        pageIndex += 1
      ) {
        const page: Page<Cast> = decodeCastsPage(
          await get(
            `${BASE}/feed/user/casts`,
            {
              fid: authorFid,
              ...pageQuery({
                limit: MAX_PAGE_SIZE,
                cursor,
                viewerFid: params.viewerFid,
              }),
            },
            options,
          ),
        );
        const match = page.items.find((cast) =>
          cast.hash.startsWith(normalized),
        );
        if (match) {
          return match;
        }
        if (page.nextCursor === null || seenCursors.has(page.nextCursor)) {
          return null;
        }
        seenCursors.add(page.nextCursor);
        cursor = page.nextCursor;
      }
      return null;
    },

    // --- users ---

    async getUserByFid(
      fid: Fid,
      params: { viewerFid?: Fid | null } = {},
      options?: CallOptions,
    ): Promise<User> {
      return decodeUserEnvelope(
        await get(
          `${BASE}/user`,
          { fid, viewer_fid: params.viewerFid ?? undefined },
          options,
        ),
      );
    },

    async getUserByUsername(
      username: string,
      params: { viewerFid?: Fid | null } = {},
      options?: CallOptions,
    ): Promise<User> {
      // Lookups are case-sensitive on the node and names are stored lowercase.
      const name = username.trim().replace(/^@/, '').toLowerCase();
      if (name === '') {
        throw new HypersnapError('not_found', 'No username given');
      }
      return decodeUserEnvelope(
        await get(
          `${BASE}/user/by-username`,
          { username: name, viewer_fid: params.viewerFid ?? undefined },
          options,
        ),
      );
    },

    async getUsersByFids(
      fids: Fid[],
      params: { viewerFid?: Fid | null } = {},
      options?: CallOptions,
    ): Promise<User[]> {
      const unique = [...new Set(fids)].slice(0, MAX_PAGE_SIZE);
      if (unique.length === 0) {
        return [];
      }
      const page = decodeUsersPage(
        await get(
          `${BASE}/user/bulk`,
          { fids: unique.join(','), viewer_fid: params.viewerFid ?? undefined },
          options,
        ),
      );
      return page.items.filter((user) => user.exists);
    },

    async getFollowers(
      fid: Fid,
      params: PageParams = {},
      options?: CallOptions,
    ): Promise<Page<User>> {
      return decodeUsersPage(
        await get(
          `${BASE}/user/followers`,
          { fid, ...pageQuery(params) },
          options,
        ),
      );
    },

    async getFollowing(
      fid: Fid,
      params: PageParams = {},
      options?: CallOptions,
    ): Promise<Page<User>> {
      return decodeUsersPage(
        await get(
          `${BASE}/user/following`,
          { fid, ...pageQuery(params) },
          options,
        ),
      );
    },

    async getSuggestedFollows(
      fid: Fid,
      params: { limit?: number; viewerFid?: Fid | null } = {},
      options?: CallOptions,
    ): Promise<User[]> {
      const page = decodeUsersPage(
        await get(
          `${BASE}/following/suggested`,
          {
            fid,
            limit: clampLimit(params.limit ?? 10),
            viewer_fid: params.viewerFid ?? undefined,
          },
          options,
        ),
      );
      return page.items;
    },

    // --- search ---

    async searchUsers(
      query: string,
      params: { limit?: number; viewerFid?: Fid | null } = {},
      options?: CallOptions,
    ): Promise<User[]> {
      const page = decodeUsersPage(
        await get(
          `${BASE}/user/search`,
          {
            q: query.trim().replace(/^@/, '').toLowerCase(),
            limit: clampLimit(params.limit),
            viewer_fid: params.viewerFid ?? undefined,
          },
          options,
        ),
      );
      return page.items;
    },

    async searchCasts(
      query: string,
      params: PageParams = {},
      options?: CallOptions,
    ): Promise<Page<Cast>> {
      return decodeCastsPage(
        await get(
          `${BASE}/cast/search`,
          { q: query.trim(), ...pageQuery(params) },
          options,
        ),
      );
    },

    async searchChannels(
      query: string,
      params: { limit?: number } = {},
      options?: CallOptions,
    ): Promise<Channel[]> {
      const page = decodeChannelsPage(
        await get(
          `${BASE}/channel/search`,
          {
            q: query.trim().replace(/^\//, '').toLowerCase(),
            limit: clampLimit(params.limit),
          },
          options,
        ),
      );
      return page.items;
    },

    // --- channels ---

    async getChannel(
      channelId: string,
      options?: CallOptions,
    ): Promise<Channel> {
      return decodeChannelEnvelope(
        await get(`${BASE}/channel`, { id: channelId.toLowerCase() }, options),
      );
    },

    async getTrendingChannels(
      params: { limit?: number } = {},
      options?: CallOptions,
    ): Promise<Channel[]> {
      const page = decodeChannelsPage(
        await get(
          `${BASE}/channel/trending`,
          { limit: clampLimit(params.limit) },
          options,
        ),
      );
      return page.items;
    },

    async getUserChannels(
      fid: Fid,
      params: { limit?: number } = {},
      options?: CallOptions,
    ): Promise<Channel[]> {
      const page = decodeChannelsPage(
        await get(
          `${BASE}/user/channels`,
          { fid, limit: clampLimit(params.limit) },
          options,
        ),
      );
      return page.items;
    },

    async getChannelMembers(
      channelId: string,
      params: PageParams = {},
      options?: CallOptions,
    ): Promise<Page<ChannelMember>> {
      return decodeChannelMembersPage(
        await get(
          `${BASE}/channel/members`,
          { channel_id: channelId.toLowerCase(), ...pageQuery(params) },
          options,
        ),
      );
    },

    // --- notifications and reactions ---

    async getNotifications(
      fid: Fid,
      params: PageParams = {},
      options?: CallOptions,
    ): Promise<Page<NotificationItem>> {
      return decodeNotificationsPage(
        await get(
          `${BASE}/notifications`,
          { fid, ...pageQuery(params) },
          options,
        ),
      );
    },

    /** The node returns at most 100 reactions and no cursor. */
    async getCastReactions(
      hash: string,
      kind: ReactionKind,
      params: { limit?: number; viewerFid?: Fid | null } = {},
      options?: CallOptions,
    ): Promise<Reaction[]> {
      const page = decodeReactionsPage(
        await get(
          `${BASE}/reaction/cast`,
          {
            hash: wireHash(requireHash(hash)),
            types: kind === 'recast' ? 'recasts' : 'likes',
            limit: clampLimit(params.limit ?? MAX_PAGE_SIZE),
            viewer_fid: params.viewerFid ?? undefined,
          },
          options,
        ),
      );
      return page.items;
    },

    /**
     * What a user has liked or recasted. The node returns only cast stubs,
     * so the casts themselves are fetched in one bulk call and returned in
     * reaction order; casts the node no longer has are left out.
     */
    async getUserReactionCasts(
      fid: Fid,
      kind: ReactionKind,
      params: { limit?: number; viewerFid?: Fid | null } = {},
      options?: CallOptions,
    ): Promise<Cast[]> {
      const page = decodeReactionsPage(
        await get(
          `${BASE}/reaction/user`,
          {
            fid,
            type: kind === 'recast' ? 'recasts' : 'likes',
            limit: clampLimit(params.limit ?? 50),
          },
          options,
        ),
      );
      const hashes = page.items.map((reaction) => reaction.castHash);
      const casts = await this.getCastsByHashes(
        hashes,
        { viewerFid: params.viewerFid },
        options,
      );
      const byHash = new Map(casts.map((cast) => [cast.hash, cast]));
      return hashes
        .map((hash) => byHash.get(hash))
        .filter((cast): cast is Cast => cast !== undefined);
    },

    // --- node ---

    async getNodeInfo(options?: CallOptions): Promise<NodeInfo> {
      return decodeNodeInfo(await get('/v1/info', undefined, options));
    },

    /** Resolves "@name", a numeric FID, or "!fid" to a user. */
    async resolveUser(
      identifier: string,
      params: { viewerFid?: Fid | null } = {},
      options?: CallOptions,
    ): Promise<User> {
      const trimmed = identifier.trim();
      const fidMatch = /^!?(\d{1,20})$/.exec(trimmed);
      if (fidMatch) {
        return this.getUserByFid(
          BigInt(fidMatch[1]).toString(),
          params,
          options,
        );
      }
      return this.getUserByUsername(trimmed, params, options);
    },
  };
}

type HypersnapApi = ReturnType<typeof createApi>;

export { createApi, DEFAULT_PAGE_SIZE, isNotFound, MAX_PAGE_SIZE };
export type { HypersnapApi, PageParams };
