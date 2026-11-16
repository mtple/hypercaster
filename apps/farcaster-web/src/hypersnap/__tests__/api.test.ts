import { createFakeNode } from '~/hypersnap/fixtures/fakeNode';

describe('read API against the synthetic node', () => {
  it('only ever issues GET requests to the configured node', async () => {
    const node = createFakeNode();
    const { api, world } = node;
    const launch = `0x${world.casts.launch.hash}`;

    await api.getTrendingFeed();
    await api.getFollowingFeed('1001');
    await api.getUserCasts('1001');
    await api.getUserReplies('1001');
    await api.getChannelFeed('builders');
    await api.getCast(launch);
    await api.getCastsByHashes([launch]);
    await api.getConversation(launch);
    await api.getQuotes(launch);
    await api.findCastByHashPrefix('1001', launch.slice(0, 10));
    await api.getUserByFid('1001');
    await api.getUserByUsername('ada');
    await api.getUsersByFids(['1001', '4294967301']);
    await api.getFollowers('1001');
    await api.getFollowing('1001');
    await api.getSuggestedFollows('1001');
    await api.searchUsers('a');
    await api.searchCasts('tide');
    await api.searchChannels('b');
    await api.getChannel('builders');
    await api.getTrendingChannels();
    await api.getUserChannels('1001');
    await api.getChannelMembers('builders');
    await api.getNotifications('1001');
    await api.getCastReactions(launch, 'like');
    await api.getUserReactionCasts('1001', 'like');
    await api.getNodeInfo();
    await api.resolveUser('@ada');

    expect(node.requests.length).toBeGreaterThan(27);
    for (const request of node.requests) {
      expect(request.method).toBe('GET');
      expect(new URL(request.url).origin).toBe('https://node.example');
      expect(
        request.path.startsWith('/v2/farcaster/') ||
          request.path.startsWith('/v1/'),
      ).toBe(true);
    }
  });

  it('pages trending and stops at the end', async () => {
    const { api } = createFakeNode();
    const hashes: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await api.getTrendingFeed({ cursor, limit: 25 });
      hashes.push(...page.items.map((cast) => cast.hash));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor !== null && pages < 10);

    expect(pages).toBe(3);
    expect(hashes).toHaveLength(73);
    expect(new Set(hashes).size).toBe(73);
  });

  it('caps the page size at what the node honours', async () => {
    const node = createFakeNode();
    await node.api.getFollowers('1001', { limit: 5000 });
    expect(new URL(node.requests[0].url).searchParams.get('limit')).toBe('100');
  });

  it('sends hashes without 0x and accepts either form', async () => {
    const node = createFakeNode();
    const bare = node.world.casts.launch.hash;
    const a = await node.api.getCast(bare);
    const b = await node.api.getCast(`0x${bare.toUpperCase()}`);
    expect(a.hash).toBe(`0x${bare}`);
    expect(b.hash).toBe(a.hash);
    expect(new URL(node.requests[1].url).searchParams.get('identifier')).toBe(
      bare,
    );
  });

  it('rejects a short hash locally instead of asking the node', async () => {
    const node = createFakeNode();
    await expect(node.api.getCast('0x6be259d1')).rejects.toMatchObject({
      kind: 'not_found',
    });
    expect(node.requests).toHaveLength(0);
  });

  it('reports a missing cast, user and channel as not found', async () => {
    const { api } = createFakeNode();
    await expect(api.getCast('0x' + '00'.repeat(20))).rejects.toMatchObject({
      kind: 'not_found',
    });
    await expect(api.getUserByUsername('nobody-here')).rejects.toMatchObject({
      kind: 'not_found',
    });
    await expect(api.getChannel('no-such-channel')).rejects.toMatchObject({
      kind: 'not_found',
    });
    // The node answers 200 with a placeholder for an unknown FID.
    await expect(api.getUserByFid('99999999999')).rejects.toMatchObject({
      kind: 'not_found',
    });
  });

  it('lowercases usernames because the node lookup is case-sensitive', async () => {
    const node = createFakeNode();
    expect((await node.api.getUserByUsername(' @ADA ')).fid).toBe('1001');
    expect(new URL(node.requests[0].url).searchParams.get('username')).toBe(
      'ada',
    );
  });

  it('resolves numbers and !fid as FIDs and everything else as a username', async () => {
    const { api } = createFakeNode();
    expect((await api.resolveUser('1002')).username).toBe('ben');
    expect((await api.resolveUser('!4294967301')).username).toBe('nova');
    expect((await api.resolveUser('chiyo')).fid).toBe('1003');
  });

  it('finds a cast from a share-link prefix by scanning the author', async () => {
    const { api, world } = createFakeNode();
    const full = `0x${world.casts.clip.hash}`;
    expect(
      (await api.findCastByHashPrefix('1001', full.slice(0, 10)))?.hash,
    ).toBe(full);
    // A reply is found too, although the node lists replies separately.
    const reply = `0x${world.casts.reply1a.hash}`;
    expect(
      (await api.findCastByHashPrefix('1001', reply.slice(0, 10)))?.hash,
    ).toBe(reply);
    expect(await api.findCastByHashPrefix('1001', '0xdeadbeef')).toBeNull();
    expect(await api.findCastByHashPrefix('1001', 'xyz')).toBeNull();
  });

  it('bounds the prefix scan', async () => {
    const node = createFakeNode();
    node.setOverride((path) =>
      path === '/v2/farcaster/feed/user/casts'
        ? {
            status: 200,
            body: {
              casts: [node.world.casts.gm],
              next: { cursor: String(Math.random()) },
            },
          }
        : null,
    );
    expect(
      await node.api.findCastByHashPrefix('1001', '0xdeadbeef', {
        maxPages: 3,
      }),
    ).toBeNull();
    // Three pages of casts, then the (short) list of replies.
    expect(node.requests.map((request) => request.path)).toEqual([
      '/v2/farcaster/feed/user/casts',
      '/v2/farcaster/feed/user/casts',
      '/v2/farcaster/feed/user/casts',
      '/v2/farcaster/feed/user/replies_and_recasts',
    ]);
  });

  it('hydrates liked casts from stubs in one bulk call and skips missing ones', async () => {
    const node = createFakeNode();
    const casts = await node.api.getUserReactionCasts('1001', 'like');
    expect(casts.map((cast) => cast.author.username)).toEqual(['ben', 'chiyo']);
    expect(node.requests.map((r) => r.path)).toEqual([
      '/v2/farcaster/reaction/user',
      '/v2/farcaster/cast/bulk',
    ]);
  });

  it('asks for viewer context only when given a viewer', async () => {
    const node = createFakeNode();
    const anonymous = await node.api.getTrendingFeed({ limit: 10 });
    const personal = await node.api.getTrendingFeed({
      limit: 10,
      viewerFid: '1001',
    });

    expect(new URL(node.requests[0].url).searchParams.has('viewer_fid')).toBe(
      false,
    );
    expect(anonymous.items.every((cast) => cast.viewerContext === null)).toBe(
      true,
    );
    expect(new URL(node.requests[1].url).searchParams.get('viewer_fid')).toBe(
      '1001',
    );
    expect(
      personal.items.find((cast) => cast.author.username === 'ben')
        ?.viewerContext,
    ).toEqual({
      liked: true,
      recasted: false,
    });
  });

  it('surfaces a node failure as an error, never as an empty list', async () => {
    const node = createFakeNode();
    await expect(node.api.searchCasts('__error__')).rejects.toMatchObject({
      kind: 'server',
      status: 500,
    });

    node.setOverride(() => 'network-error');
    await expect(node.api.getTrendingFeed()).rejects.toMatchObject({
      kind: 'network',
    });

    node.setOverride(() => ({ status: 200, body: { unexpected: true } }));
    await expect(node.api.getTrendingFeed()).rejects.toMatchObject({
      kind: 'malformed',
    });
  });

  it('returns an honest empty page for an FID with nothing', async () => {
    const { api } = createFakeNode();
    expect(await api.getFollowingFeed('99999999999')).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(await api.getNotifications('99999999999')).toEqual({
      items: [],
      nextCursor: null,
    });
  });
});
