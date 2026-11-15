import { HypersnapError } from '~/hypersnap/errors';
import { createWorld } from '~/hypersnap/fixtures/world.mjs';
import {
  decodeCast,
  decodeCastsPage,
  decodeChannelMembersPage,
  decodeChannelsPage,
  decodeConversation,
  decodeNextCursor,
  decodeNotificationsPage,
  decodeReactionsPage,
  decodeTimestamp,
  decodeUser,
  decodeUserEnvelope,
  decodeUsersPage,
  handleOf,
  restoreMentions,
} from '~/hypersnap/normalize';

const world = createWorld();
const query = (params: Record<string, string> = {}) => new URLSearchParams(params);

describe('users', () => {
  it('decodes a legacy user', () => {
    const user = decodeUser(world.users.ada);
    expect(user).toMatchObject({
      fid: '1001',
      username: 'ada',
      displayName: 'Ada Okafor',
      isNative: false,
      exists: true,
      followerCount: 37,
      viewerContext: null,
    });
    expect(user?.pfpUrl).toBe('https://media.example/avatar/ada.svg');
  });

  it('keeps a native string FID exact and flags it', () => {
    expect(decodeUser(world.users.nova)).toMatchObject({
      fid: '4294967301',
      isNative: true,
      username: 'nova',
    });
    expect(decodeUser({ fid: '9007199254740993', username: 'big' })?.fid).toBe(
      '9007199254740993',
    );
  });

  it('treats the "fid:N" placeholder as no username, but a real account', () => {
    const user = decodeUser(world.users.anon);
    expect(user).toMatchObject({ username: '', exists: true, pfpUrl: null });
    expect(user?.displayName).toBe('!4294967296');
    expect(handleOf(user!)).toBe('!4294967296');
  });

  it('reports the empty placeholder for an unknown FID as not found', () => {
    const { body } = world.handle('/v2/farcaster/user', query({ fid: '99999999999' }));
    expect(decodeUser((body as { user: unknown }).user)?.exists).toBe(false);
    expect(() => decodeUserEnvelope(body)).toThrowError(
      expect.objectContaining({ kind: 'not_found' }),
    );
  });

  it('tolerates missing avatar, bio and counts', () => {
    expect(decodeUser({ fid: 7 })).toMatchObject({
      fid: '7',
      pfpUrl: null,
      bio: '',
      followerCount: 0,
      followingCount: 0,
    });
  });

  it('drops an unsafe avatar URL', () => {
    expect(decodeUser({ fid: 7, pfp_url: 'javascript:alert(1)' })?.pfpUrl).toBeNull();
  });

  it('rejects objects without a usable FID', () => {
    expect(decodeUser({ username: 'nobody' })).toBeNull();
    expect(decodeUser({ fid: 0 })).toBeNull();
    expect(decodeUser(null)).toBeNull();
    expect(decodeUser('user')).toBeNull();
  });

  it('reads viewer context when the node includes it', () => {
    const { body } = world.handle('/v2/farcaster/user', query({ fid: '1002', viewer_fid: '1001' }));
    expect(decodeUserEnvelope(body).viewerContext).toEqual({
      following: true,
      followedBy: true,
    });
  });

  it('unwraps both list shapes', () => {
    const plain = decodeUsersPage({ users: [world.users.ada], next: { cursor: '50' } });
    const wrapped = decodeUsersPage({
      result: { users: [{ object: 'follower', user: world.users.ben }], next: {} },
    });
    expect(plain.items[0].username).toBe('ada');
    expect(plain.nextCursor).toBe('50');
    expect(wrapped.items[0].username).toBe('ben');
    expect(wrapped.nextCursor).toBeNull();
  });

  it('throws malformed when the envelope is wrong', () => {
    expect(() => decodeUsersPage({ people: [] })).toThrow(HypersnapError);
    expect(() => decodeUsersPage('nope')).toThrowError(
      expect.objectContaining({ kind: 'malformed' }),
    );
  });
});

describe('mentions', () => {
  it('splices a mention back in at a UTF-8 byte offset', () => {
    // Real shape seen on the node: multi-byte text, zero-width range.
    const raw = '発見タイム😏\n\n夢の箱あったあった😍\n\n 売り切れごめん';
    const { text, mentions } = restoreMentions(
      raw,
      [{ fid: 774935, username: 'kita' }],
      [{ start: 54, end: 54 }],
    );
    expect(text).toBe('発見タイム😏\n\n夢の箱あったあった😍\n\n@kita 売り切れごめん');
    expect(text.slice(mentions[0].start, mentions[0].end)).toBe('@kita');
    expect(mentions[0]).toMatchObject({ fid: '774935', username: 'kita' });
  });

  it('handles several mentions, including two at the same offset', () => {
    const { text, mentions } = restoreMentions(
      ' and  met',
      [
        { fid: 1, username: 'a' },
        { fid: 2, username: 'b' },
        { fid: 3, username: 'c' },
      ],
      [
        { start: 0, end: 0 },
        { start: 5, end: 5 },
        { start: 5, end: 5 },
      ],
    );
    expect(text).toBe('@a and @b@c met');
    expect(mentions.map((m) => text.slice(m.start, m.end))).toEqual(['@a', '@b', '@c']);
  });

  it('uses !fid for a mentioned account without a username', () => {
    expect(
      restoreMentions('hi ', [{ fid: '4294967296', username: 'fid:4294967296' }], [{ start: 3, end: 3 }]).text,
    ).toBe('hi !4294967296');
  });

  it('never splits a multi-byte character when an offset is off', () => {
    // Offset 1 lands inside the 3-byte "朝".
    const { text } = restoreMentions('朝', [{ fid: 1, username: 'a' }], [{ start: 1, end: 1 }]);
    expect(text).toBe('@a朝');
  });

  it('links mentions a node left inline instead of doubling them', () => {
    const { text, mentions } = restoreMentions(
      'hey @ada ok',
      [{ fid: 1001, username: 'ada' }],
      [{ start: 4, end: 8 }],
    );
    expect(text).toBe('hey @ada ok');
    expect(text.slice(mentions[0].start, mentions[0].end)).toBe('@ada');
  });

  it('ignores ranges that are out of bounds or malformed', () => {
    const { text, mentions } = restoreMentions(
      'hello',
      [{ fid: 1, username: 'a' }, { fid: 2, username: 'b' }, { fid: 3, username: 'c' }],
      [{ start: 99, end: 99 }, { start: -1 }, { start: 'x' }],
    );
    expect(text).toBe('hello');
    expect(mentions).toEqual([]);
  });
});

describe('casts', () => {
  it('normalises hash, text, counts, channel and timestamps', () => {
    const cast = decodeCast(world.casts.launch)!;
    expect(cast.hash).toBe(`0x${world.casts.launch.hash}`);
    expect(cast.author.username).toBe('ada');
    expect(cast.channelId).toBe('builders');
    expect(cast.likesCount).toBe(5);
    expect(cast.recastsCount).toBe(2);
    expect(cast.repliesCount).toBe(3);
    expect(cast.parentHash).toBeNull();
    expect(cast.parentAuthorFid).toBeNull();
    expect(cast.viewerContext).toBeNull();
    expect(cast.timestamp).toBe('2026-11-15T17:18:00.000Z');
    expect(cast.timestampMs).toBe(Date.parse('2026-11-15T17:18:00.000Z'));
  });

  it('derives the channel from a parent URL on any host', () => {
    expect(decodeCast(world.casts.coast)?.channelId).toBe('photo');
  });

  it('restores a mention inside multi-byte text', () => {
    const cast = decodeCast(world.casts.walk)!;
    expect(cast.text).toBe('朝の散歩で見つけた景色 📷\n\n@ada さん、この前の話の続きです ✨');
    expect(cast.mentions).toHaveLength(1);
    expect(cast.text.slice(cast.mentions[0].start, cast.mentions[0].end)).toBe('@ada');
  });

  it('classifies embeds and drops unsafe ones', () => {
    expect(decodeCast(world.casts.walk)?.embeds.map((e) => e.kind)).toEqual(['image', 'image']);
    expect(decodeCast(world.casts.clip)?.embeds[0]).toMatchObject({ kind: 'video', streaming: false });
    expect(decodeCast(world.casts.stream)?.embeds[0]).toMatchObject({ kind: 'video', streaming: true });
    expect(decodeCast(world.casts.links)?.embeds[0]).toMatchObject({ kind: 'link', host: 'longreads.example' });
    expect(decodeCast(world.casts.unsafe)?.embeds).toEqual([]);
  });

  it('turns a cast_id embed into a quote reference', () => {
    expect(decodeCast(world.casts.quoting)?.embeds).toEqual([
      { kind: 'cast', fid: '1001', hash: `0x${world.casts.launch.hash}` },
    ]);
  });

  it('reads reply metadata', () => {
    const reply = decodeCast(world.casts.reply1a)!;
    expect(reply.parentHash).toBe(`0x${world.casts.reply1.hash}`);
    expect(reply.parentAuthorFid).toBe('1002');
    expect(reply.threadHash).toBe(`0x${world.casts.launch.hash}`);
  });

  it('survives missing optional fields', () => {
    const cast = decodeCast({ hash: 'ab'.repeat(20), author: { fid: 5 } })!;
    expect(cast).toMatchObject({
      text: '',
      embeds: [],
      mentions: [],
      timestamp: null,
      likesCount: 0,
      threadHash: null,
      channelId: null,
    });
  });

  it('rejects a cast with no author or a bad hash', () => {
    expect(decodeCast({ hash: 'ab'.repeat(20) })).toBeNull();
    expect(decodeCast({ hash: 'short', author: { fid: 5 } })).toBeNull();
  });

  it('drops bad items from a page instead of failing the page', () => {
    const page = decodeCastsPage({
      casts: [world.casts.gm, { hash: 'nope' }, null, world.casts.coast],
      next: { cursor: 'abc' },
    });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe('abc');
  });

  it('accepts cast search nested under `result`', () => {
    const { body } = world.handle('/v2/farcaster/cast/search', query({ q: 'tide' }));
    expect(decodeCastsPage(body).items[0].author.username).toBe('ben');
  });

  it('throws malformed for an unrecognisable page', () => {
    expect(() => decodeCastsPage({ message: 'ok' })).toThrowError(
      expect.objectContaining({ kind: 'malformed' }),
    );
  });
});

describe('pagination', () => {
  it('treats every "no more" form as the end', () => {
    expect(decodeNextCursor({ cursor: 'x' })).toBe('x');
    expect(decodeNextCursor({ cursor: 50 })).toBe('50');
    expect(decodeNextCursor({})).toBeNull();
    expect(decodeNextCursor({ cursor: null })).toBeNull();
    expect(decodeNextCursor({ cursor: '' })).toBeNull();
    expect(decodeNextCursor(undefined)).toBeNull();
    expect(decodeNextCursor(null)).toBeNull();
  });
});

describe('timestamps', () => {
  it('accepts ISO strings, unix seconds, milliseconds and Farcaster-epoch seconds', () => {
    const expected = '2026-11-15T17:18:00.000Z';
    const ms = Date.parse(expected);
    expect(decodeTimestamp(expected).iso).toBe(expected);
    expect(decodeTimestamp(ms / 1000).iso).toBe(expected);
    expect(decodeTimestamp(ms).iso).toBe(expected);
    expect(decodeTimestamp(ms / 1000 - 1609459200).iso).toBe(expected);
  });

  it('returns null for junk rather than an invalid date', () => {
    for (const bad of ['', 'yesterday', 0, -5, NaN, null, undefined, {}]) {
      expect(decodeTimestamp(bad)).toEqual({ iso: null, ms: null });
    }
  });
});

describe('conversation', () => {
  it('decodes the observed nested shape', () => {
    const { body } = world.handle(
      '/v2/farcaster/cast/conversation',
      query({ identifier: world.casts.launch.hash, type: 'hash', reply_depth: '3' }),
    );
    const root = decodeConversation(body);
    expect(root.cast.hash).toBe(`0x${world.casts.launch.hash}`);
    expect(root.replies.map((r) => r.cast.author.username)).toEqual(['ben', 'esme', 'farid']);
    expect(root.replies[0].replies[0].cast.author.username).toBe('ada');
    expect(root.replies[0].replies[0].replies[0].cast.author.username).toBe('chiyo');
  });

  it('decodes the documented { cast, replies } shape too', () => {
    const root = decodeConversation({
      cast: world.casts.launch,
      replies: [{ cast: world.casts.reply1, replies: [{ cast: world.casts.reply1a, replies: [] }] }],
    });
    expect(root.replies[0].replies[0].cast.hash).toBe(`0x${world.casts.reply1a.hash}`);
  });

  it('caps runaway nesting', () => {
    let node: Record<string, unknown> = { ...world.casts.gm, direct_replies: [] };
    for (let i = 0; i < 40; i += 1) {
      node = { ...world.casts.gm, direct_replies: [node] };
    }
    let depth = 0;
    let cursor = decodeConversation({ conversation: { cast: node } });
    while (cursor.replies.length > 0) {
      cursor = cursor.replies[0];
      depth += 1;
    }
    expect(depth).toBe(12);
  });

  it('throws malformed without a root cast', () => {
    expect(() => decodeConversation({ conversation: {} })).toThrowError(
      expect.objectContaining({ kind: 'malformed' }),
    );
  });
});

describe('channels', () => {
  it('keeps real channels and filters token pseudo-channels', () => {
    const page = decodeChannelsPage({ channels: world.channels, next: {} });
    expect(page.items.map((c) => c.id)).toEqual(['builders', 'photo', 'music']);
    expect(page.items[0]).toMatchObject({ name: 'builders', memberCount: 128, imageUrl: null, description: null });
  });

  it('decodes members from `members` (observed) and `users` (documented)', () => {
    const { body } = world.handle('/v2/farcaster/channel/members', query({ channel_id: 'photo' }));
    expect(decodeChannelMembersPage(body).items.map((m) => [m.user.username, m.role])).toEqual([
      ['ben', 'member'],
      ['chiyo', 'member'],
    ]);
    expect(decodeChannelMembersPage({ users: [world.users.ada] }).items[0]).toMatchObject({ role: '' });
  });
});

describe('notifications', () => {
  it('maps the observed type names', () => {
    const { body } = world.handle('/v2/farcaster/notifications', query({ fid: '1001', limit: '13' }));
    const page = decodeNotificationsPage(body);
    expect(page.items.map((n) => n.kind)).toEqual([
      'like', 'follow', 'quote', 'like', 'recast', 'reply', 'like', 'reply', 'like', 'like', 'recast', 'mention', 'follow',
    ]);
    expect(page.items[1]).toMatchObject({ cast: null });
    expect(page.items[1].actor.username).toBe('nova');
    expect(page.nextCursor).toBe('13');
  });

  it('maps the documented type names and aggregate arrays', () => {
    const page = decodeNotificationsPage({
      notifications: [
        { type: 'cast-reply', most_recent_timestamp: 1794700000, cast: world.casts.reply1 },
        { type: 'follow', follows: [{ user: world.users.ben }, { user: world.users.gus }] },
        { type: 'reaction', cast: world.casts.launch, reactions: [{ user: world.users.esme }] },
        { type: 'brand-new-kind', user: world.users.hana },
      ],
      next: {},
    });
    expect(page.items.map((n) => [n.kind, n.actor.username])).toEqual([
      ['reply', 'ben'],
      ['follow', 'ben'],
      ['follow', 'gus'],
      ['like', 'esme'],
      ['unknown', 'hana'],
    ]);
  });
});

describe('reactions', () => {
  it('decodes stubs: who reacted and to which cast', () => {
    const { body } = world.handle(
      '/v2/farcaster/reaction/cast',
      query({ hash: world.casts.launch.hash, types: 'recasts', limit: '100' }),
    );
    const page = decodeReactionsPage(body);
    expect(page.items.map((r) => [r.kind, r.user.username])).toEqual([
      ['recast', 'farid'],
      ['recast', 'gus'],
    ]);
    expect(page.items[0].castHash).toBe(`0x${world.casts.launch.hash}`);
    expect(page.items[0].castAuthorFid).toBe('1001');
    expect(page.nextCursor).toBeNull();
  });
});
