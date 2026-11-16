/**
 * Opt-in checks against a real Hypersnap node. Read-only: every request is
 * a GET, and nothing is ever submitted.
 *
 *   pnpm test:live
 *   VITE_HYPERSNAP_URL=https://your-node.example pnpm test:live
 *
 * Skipped unless HYPERCAST_LIVE=1, so ordinary test runs stay offline.
 * A live network changes from minute to minute, so these assert shapes and
 * invariants, never particular content.
 */
import { describe, expect, it } from 'vitest';

import { createApi } from '~/hypersnap/api';
import { createConfig } from '~/hypersnap/config';
import { isNotFound } from '~/hypersnap/errors';
import { createTransport } from '~/hypersnap/http';

const LIVE = process.env.HYPERCAST_LIVE === '1';
const HASH = /^0x[0-9a-f]{40}$/;
const FID = /^[1-9][0-9]*$/;

describe.skipIf(!LIVE)('live node (read-only)', () => {
  const config = createConfig({
    VITE_HYPERSNAP_URL: process.env.VITE_HYPERSNAP_URL,
  });
  const methods: string[] = [];
  const transport = createTransport(config, {
    fetch: (input, init) => {
      methods.push((init?.method ?? 'GET').toUpperCase());
      return fetch(input, init);
    },
  });
  const api = createApi(transport);
  const timeout = 60_000;

  it(
    'answers the node info route',
    async () => {
      const info = await api.getNodeInfo();
      expect(info.shardHeights.length).toBeGreaterThan(0);
    },
    timeout,
  );

  it(
    'serves a trending feed that decodes and pages',
    async () => {
      const first = await api.getTrendingFeed({ limit: 10 });
      expect(first.items.length).toBeGreaterThan(0);
      for (const cast of first.items) {
        expect(cast.hash).toMatch(HASH);
        expect(cast.author.fid).toMatch(FID);
        expect(typeof cast.text).toBe('string');
        expect(cast.likesCount).toBeGreaterThanOrEqual(0);
      }
      if (first.nextCursor !== null) {
        const second = await api.getTrendingFeed({
          limit: 10,
          cursor: first.nextCursor,
        });
        expect(Array.isArray(second.items)).toBe(true);
      }
    },
    timeout,
  );

  it(
    'opens a cast from the feed as a conversation, by either hash form',
    async () => {
      const { items } = await api.getTrendingFeed({ limit: 5 });
      const cast = await api.getCast(items[0].hash);
      expect(cast.hash).toBe(items[0].hash);
      expect((await api.getCast(items[0].hash.slice(2))).hash).toBe(cast.hash);
      const conversation = await api.getConversation(cast.hash);
      expect(conversation.cast.hash).toBe(cast.hash);
      expect(Array.isArray(conversation.replies)).toBe(true);
    },
    timeout,
  );

  it(
    'resolves an author by number and by name, with their casts',
    async () => {
      const { items } = await api.getTrendingFeed({ limit: 10 });
      const author = items.find((cast) => cast.author.username !== '')?.author;
      expect(author).toBeDefined();
      if (!author) {
        return;
      }
      const byFid = await api.getUserByFid(author.fid);
      expect(byFid.fid).toBe(author.fid);
      expect(byFid.exists).toBe(true);
      const byName = await api.getUserByUsername(author.username);
      expect(byName.fid).toBe(author.fid);
      const casts = await api.getUserCasts(author.fid, { limit: 5 });
      expect(Array.isArray(casts.items)).toBe(true);
      const followers = await api.getFollowers(author.fid, { limit: 5 });
      expect(followers.items.every((user) => FID.test(user.fid))).toBe(true);
    },
    timeout,
  );

  it(
    'reports an unregistered account number as not found',
    async () => {
      const result = await api.getUserByFid('18446744073709551000').then(
        () => 'found',
        (error) =>
          isNotFound(error) ? 'not_found' : `other: ${String(error)}`,
      );
      expect(result).toBe('not_found');
    },
    timeout,
  );

  it(
    'searches users and lists channels',
    async () => {
      const users = await api.searchUsers('a', { limit: 5 });
      expect(Array.isArray(users)).toBe(true);
      const channels = await api.getTrendingChannels({ limit: 5 });
      expect(Array.isArray(channels)).toBe(true);
    },
    timeout,
  );

  it('made GET requests only', () => {
    expect(methods.length).toBeGreaterThan(0);
    expect(new Set(methods)).toEqual(new Set(['GET']));
  });
});
