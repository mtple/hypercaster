// @ts-check
/**
 * A small, fully synthetic Hypersnap "world" for tests and offline
 * development. Every person, cast and channel here is invented.
 *
 * `handle()` answers the same routes, with the same response shapes and the
 * same quirks, as a real node:
 *   - cast hashes are returned without "0x"
 *   - legacy FIDs are JSON numbers, native FIDs (>= 2^32) are strings
 *   - mentions are removed from `text` and reported as UTF-8 byte offsets
 *   - an unknown FID is a 200 with a placeholder user, not a 404
 *   - lists end with `next: {}` and `limit` is capped at 100
 *   - cast search nests under `result`; channel members under `members`
 */

const NOW = Date.parse('2026-11-15T18:00:00.000Z');
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Deterministic 20-byte hash for cast number `n`. */
function hashOf(n) {
  let state = BigInt(n) * 0x9e3779b97f4a7c15n + 0x1234567n;
  let hex = '';
  while (hex.length < 40) {
    state = (state * 6364136223846793005n + 1442695040888963407n) % (1n << 64n);
    hex += state.toString(16).padStart(16, '0');
  }
  return hex.slice(0, 40);
}

const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, '.000Z');
const byteLength = (text) => new TextEncoder().encode(text).length;

/**
 * @param {{ mediaBase?: string, now?: number }} [options]
 */
export function createWorld(options = {}) {
  const mediaBase = options.mediaBase ?? 'https://media.example';
  const now = options.now ?? NOW;

  // --- people -------------------------------------------------------------

  /** @type {Map<string, any>} */
  const users = new Map();

  function addUser({ fid, username, displayName, bio = '', pfp = true, followers = 0, following = 0, registeredDaysAgo = 400 }) {
    const key = String(fid);
    const custody = `0x${key.padStart(40, 'a').slice(-40)}`;
    const user = {
      object: 'user',
      fid,
      username: username ?? `fid:${key}`,
      ...(displayName ? { display_name: displayName } : {}),
      custody_address: custody,
      ...(pfp ? { pfp_url: `${mediaBase}/avatar/${username ?? key}.svg` } : {}),
      registered_at: iso(now - registeredDaysAgo * DAY),
      profile: { bio: { text: bio } },
      follower_count: followers,
      following_count: following,
      verifications: [],
      auth_addresses: [],
      verified_addresses: { eth_addresses: [], sol_addresses: [], primary: {} },
      verified_accounts: [],
    };
    users.set(key, user);
    return user;
  }

  const ada = addUser({ fid: 1001, username: 'ada', displayName: 'Ada Okafor', bio: 'Building small tools for big conversations. Maintainer of things nobody notices until they break.', followers: 37, following: 4 });
  const ben = addUser({ fid: 1002, username: 'ben', displayName: 'Ben Castillo', bio: 'Photographer. Mostly coastlines.', followers: 812, following: 190 });
  const chiyo = addUser({ fid: 1003, username: 'chiyo', displayName: '千代 Chiyo', bio: '写真と散歩。', followers: 2304, following: 77 });
  const devon = addUser({ fid: 1004, username: 'devon', displayName: 'Devon Reyes', bio: '', pfp: false, followers: 12, following: 40 });
  const esme = addUser({ fid: 1005, username: 'esme', displayName: 'Esme Lindqvist', bio: 'Notes on protocol design, written slowly. Long-form at https://esme.example/notes — replies welcome, patience appreciated. Formerly distributed systems, currently distributed attention.', followers: 15890, following: 312 });
  const farid = addUser({ fid: 1006, username: 'farid', displayName: 'Farid Haddad', bio: 'Radio, synths, sandwiches.', followers: 640, following: 512 });
  const gus = addUser({ fid: 1007, username: 'gus', displayName: 'Gus Thornton', bio: 'Links I liked.', followers: 95, following: 88 });
  const hana = addUser({ fid: 1008, username: 'hana', displayName: 'Hana Sato', bio: 'gm', followers: 1200, following: 301 });
  // Native accounts: FIDs from 2^32, serialized as strings.
  const nova = addUser({ fid: '4294967301', username: 'nova', displayName: 'Nova', bio: 'Registered on Hypersnap. No Snapchain history.', followers: 9, following: 14, registeredDaysAgo: 1 });
  const anon = addUser({ fid: '4294967296', displayName: undefined, username: undefined, pfp: false, followers: 1, following: 0, registeredDaysAgo: 1 });

  const fillers = [];
  for (let i = 0; i < 34; i += 1) {
    fillers.push(
      addUser({ fid: 2000 + i, username: `reader${String(i).padStart(2, '0')}`, displayName: `Reader ${i}`, bio: `Filler account ${i}.`, followers: i, following: i }),
    );
  }

  const fidKey = (user) => String(user.fid);
  const following = new Map([
    [fidKey(ada), [ben, chiyo, esme, nova].map(fidKey)],
    [fidKey(ben), [ada, chiyo].map(fidKey)],
    [fidKey(nova), [ada].map(fidKey)],
  ]);
  const followersOf = new Map([
    [fidKey(ada), [ben, chiyo, esme, farid, nova, gus, hana, ...fillers].map(fidKey)],
    [fidKey(ben), [ada, chiyo].map(fidKey)],
  ]);
  const suggestedFor = new Map([[fidKey(ada), [farid, gus, hana].map(fidKey)]]);

  // --- casts --------------------------------------------------------------

  /** @type {Map<string, any>} */
  const casts = new Map();
  let castCounter = 0;

  /**
   * `parts` is a list of strings and user objects; users become mentions.
   */
  function addCast({ author, parts, minutesAgo, embeds = [], channel = null, parent = null, parentUrlHost = 'warpcast.com', likes = 0, recasts = 0 }) {
    castCounter += 1;
    const hash = hashOf(castCounter);
    let text = '';
    const mentionedProfiles = [];
    const ranges = [];
    for (const part of [].concat(parts)) {
      if (typeof part === 'string') {
        text += part;
      } else {
        const at = byteLength(text);
        mentionedProfiles.push(part);
        ranges.push({ start: at, end: at });
      }
    }
    const channelUrl = channel ? `https://${parentUrlHost}/~/channel/${channel}` : null;
    const root = parent ? casts.get(parent.thread_hash ?? parent.hash) : null;
    const cast = {
      object: 'cast',
      hash,
      ...(parent ? { parent_hash: parent.hash } : {}),
      ...(!parent && channelUrl ? { parent_url: channelUrl } : {}),
      ...(channelUrl || root?.root_parent_url ? { root_parent_url: channelUrl ?? root.root_parent_url } : {}),
      parent_author: { fid: parent ? parent.author.fid : null },
      author,
      text,
      timestamp: iso(now - minutesAgo * MINUTE),
      embeds,
      type: 'cast',
      reactions: { likes_count: likes, recasts_count: recasts, likes: [], recasts: [] },
      replies: { count: 0 },
      thread_hash: parent ? (parent.thread_hash ?? parent.hash) : hash,
      format_version: 0,
      mentioned_profiles: mentionedProfiles,
      mentioned_profiles_ranges: ranges,
      mentioned_channels: [],
      mentioned_channels_ranges: [],
    };
    if (parent) {
      parent.replies.count += 1;
    }
    casts.set(hash, cast);
    return cast;
  }

  const image = (seed) => ({ url: `${mediaBase}/image/${seed}.svg` });

  const launch = addCast({
    author: ada,
    parts: 'Shipping day. The read path is finished: feeds, threads, profiles and search all come straight from the node, no middle layer.\n\nNext up is making the empty states say something useful.',
    minutesAgo: 42,
    channel: 'builders',
    likes: 5,
    recasts: 2,
  });
  const coast = addCast({
    author: ben,
    parts: 'Low tide this morning. Notes on the walk are at https://ben.example/low-tide',
    minutesAgo: 75,
    embeds: [image('coast')],
    channel: 'photo',
    parentUrlHost: 'channels.example',
    likes: 48,
    recasts: 6,
  });
  const walk = addCast({
    author: chiyo,
    parts: ['朝の散歩で見つけた景色 📷\n\n', ada, ' さん、この前の話の続きです ✨'],
    minutesAgo: 130,
    embeds: [image('walk-1'), image('walk-2')],
    likes: 132,
    recasts: 21,
  });
  const essay = addCast({
    author: esme,
    parts:
      'A note on pagination, because it keeps coming up.\n\n' +
      'Offsets are the easy answer and the wrong one for anything ranked. The list moves underneath you: by the time you ask for items twenty to forty, three of the first twenty have dropped a place and you see them twice, or something climbed and you never see it at all. Cursors that name a position in the data rather than a count from the top do not have this problem, but they cost you the ability to jump to page nine.\n\n' +
      'Nobody has ever wanted page nine of a feed. What people want is to keep scrolling and not see the same thing again, which is a much smaller promise and one a client can keep on its own by remembering what it has already shown.\n\n' +
      'So: treat the cursor as opaque, stop when it repeats, and de-duplicate on the way in. That is the whole trick.',
    minutesAgo: 190,
    likes: 310,
    recasts: 87,
  });
  const quoting = addCast({
    author: farid,
    parts: 'This is the approach I was arguing for last week.',
    minutesAgo: 30,
    embeds: [{ cast_id: { fid: launch.author.fid, hash: launch.hash } }],
    likes: 3,
  });
  const nativeHello = addCast({
    author: nova,
    parts: 'First cast from an account registered on Hypersnap itself. Hello from past the 32-bit line.',
    minutesAgo: 12,
    likes: 7,
    recasts: 1,
  });
  const noAvatar = addCast({
    author: devon,
    parts: 'No avatar, no problem.',
    minutesAgo: 260,
    likes: 1,
  });
  const clip = addCast({
    author: ada,
    parts: 'Screen recording of the thread view.',
    minutesAgo: 300,
    embeds: [{ url: `${mediaBase}/video/thread-demo.mp4` }],
    channel: 'builders',
    likes: 14,
  });
  const stream = addCast({
    author: ben,
    parts: 'Timelapse from the headland.',
    minutesAgo: 340,
    embeds: [{ url: `${mediaBase}/video/headland/master.m3u8` }],
    likes: 22,
  });
  const anonCast = addCast({
    author: anon,
    parts: 'Posting before picking a username.',
    minutesAgo: 20,
  });
  const links = addCast({
    author: gus,
    parts: 'Worth a read.',
    minutesAgo: 400,
    embeds: [{ url: 'https://longreads.example/essays/on-small-software' }],
    channel: 'builders',
    likes: 9,
  });
  const gm = addCast({
    author: hana,
    parts: 'gm\n\n☀️',
    minutesAgo: 8,
    likes: 64,
    recasts: 3,
  });
  const unsafe = addCast({
    author: gus,
    parts: 'Embeds that are not web links are dropped.',
    minutesAgo: 420,
    embeds: [{ url: 'javascript:alert(1)' }, { url: 'ipfs://bafybeigdyrzt5examplecid' }],
  });

  // Replies under the launch cast, three levels deep.
  const reply1 = addCast({ author: ben, parts: 'Congratulations. Does search cover channels too?', minutesAgo: 38, parent: launch, likes: 2 });
  const reply1a = addCast({ author: ada, parts: [ben, ' yes — users, casts and channels each have their own tab.'], minutesAgo: 35, parent: reply1, likes: 1 });
  const reply1a1 = addCast({ author: chiyo, parts: 'チャンネル検索、助かります。', minutesAgo: 33, parent: reply1a });
  const reply2 = addCast({ author: esme, parts: 'Empty states are where trust is won or lost. Looking forward to it.', minutesAgo: 31, parent: launch, likes: 4 });
  const reply3 = addCast({ author: farid, parts: 'Quoted this.', minutesAgo: 29, parent: launch });

  // A reply whose parent this node does not have.
  castCounter += 1;
  const missingParentHash = hashOf(9_000_001);
  const orphan = addCast({ author: gus, parts: 'Replying to something this node never saw.', minutesAgo: 500 });
  orphan.parent_hash = missingParentHash;
  orphan.parent_author = { fid: 999_999 };
  orphan.thread_hash = missingParentHash;

  const fillerCasts = [];
  for (let i = 0; i < 60; i += 1) {
    fillerCasts.push(
      addCast({
        author: fillers[i % fillers.length],
        parts: `Filler cast number ${i + 1}, here so that lists are long enough to page through.`,
        minutesAgo: 600 + i * 7,
        channel: i % 5 === 0 ? 'builders' : null,
        likes: i % 9,
      }),
    );
  }

  const trendingOrder = [gm, nativeHello, launch, quoting, anonCast, coast, walk, essay, noAvatar, clip, stream, links, unsafe, ...fillerCasts];

  const likesOnCast = new Map([[launch.hash, [ben, chiyo, esme, farid, nova]]]);
  const recastsOnCast = new Map([[launch.hash, [farid, gus]]]);
  const likedBy = new Map([[fidKey(ada), [coast.hash, walk.hash, hashOf(9_000_002)]]]);
  const recastedBy = new Map([[fidKey(ada), [quoting.hash]]]);

  // --- channels -----------------------------------------------------------

  const channels = [
    { object: 'channel', id: 'builders', url: 'https://warpcast.com/~/channel/builders', name: 'builders', parent_url: 'https://warpcast.com/~/channel/builders', created_at: iso(now - 40 * MINUTE), member_count: 128 },
    { object: 'channel', id: 'photo', url: 'https://channels.example/~/channel/photo', name: 'photo', parent_url: 'https://channels.example/~/channel/photo', created_at: iso(now - 75 * MINUTE), member_count: 42 },
    { object: 'channel', id: 'music', url: 'https://warpcast.com/~/channel/music', name: 'music', parent_url: 'https://warpcast.com/~/channel/music', created_at: iso(now - 3 * DAY), member_count: 17 },
    // The node lists token and chain URLs as channels too.
    { object: 'channel', id: 'eip155:8453/erc20:0xccd5951b8e3c665483f45af633e9588fdcf74ba3', url: 'eip155:8453/erc20:0xccd5951b8e3c665483f45af633e9588fdcf74ba3', name: 'eip155:8453/erc20:0xccd5951b8e3c665483f45af633e9588fdcf74ba3', parent_url: 'eip155:8453/erc20:0xccd5951b8e3c665483f45af633e9588fdcf74ba3', created_at: iso(now - DAY), member_count: 3 },
  ];
  const channelMembers = new Map([
    ['builders', [ada, ben, esme, gus, ...fillers.slice(0, 20)]],
    ['photo', [ben, chiyo]],
    ['music', [farid]],
  ]);

  // --- notifications ------------------------------------------------------

  const notificationsFor = new Map([
    [
      fidKey(ada),
      [
        { type: 'likes', cast: launch, user: nova, minutesAgo: 5 },
        { type: 'follows', cast: null, user: nova, minutesAgo: 9 },
        { type: 'quote', cast: quoting, user: farid, minutesAgo: 30 },
        { type: 'likes', cast: launch, user: farid, minutesAgo: 31 },
        { type: 'recasts', cast: launch, user: farid, minutesAgo: 31 },
        { type: 'reply', cast: reply2, user: esme, minutesAgo: 31 },
        { type: 'likes', cast: launch, user: esme, minutesAgo: 32 },
        { type: 'reply', cast: reply1, user: ben, minutesAgo: 38 },
        { type: 'likes', cast: launch, user: chiyo, minutesAgo: 39 },
        { type: 'likes', cast: launch, user: ben, minutesAgo: 40 },
        { type: 'recasts', cast: launch, user: gus, minutesAgo: 41 },
        { type: 'mention', cast: walk, user: chiyo, minutesAgo: 130 },
        { type: 'follows', cast: null, user: gus, minutesAgo: 900 },
        ...fillers.slice(0, 30).map((user, i) => ({ type: 'follows', cast: null, user, minutesAgo: 1000 + i })),
      ],
    ],
  ]);

  // --- wire helpers -------------------------------------------------------

  const json = (body, status = 200) => ({ status, body });
  const notFound = (message) => json({ message }, 404);
  const missingParam = (name) => json({ message: `Missing required parameter: ${name}` }, 400);
  const clampLimit = (query) => {
    const parsed = Number(query.get('limit') ?? '10');
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(100, Math.floor(parsed)) : 10;
  };
  const normalizeHash = (value) => (value ?? '').toLowerCase().replace(/^0x/, '');

  function paginate(list, query) {
    const limit = clampLimit(query);
    const offset = Number(query.get('cursor') ?? '0') || 0;
    const items = list.slice(offset, offset + limit);
    const next = offset + limit < list.length ? { cursor: String(offset + limit) } : {};
    return { items, next };
  }

  function withViewer(cast, viewerFid) {
    if (!viewerFid) {
      return cast;
    }
    return {
      ...cast,
      author: userFor(cast.author, viewerFid),
      viewer_context: {
        liked: (likedBy.get(viewerFid) ?? []).includes(cast.hash),
        recasted: (recastedBy.get(viewerFid) ?? []).includes(cast.hash),
      },
    };
  }

  function userFor(user, viewerFid) {
    if (!viewerFid) {
      return user;
    }
    const key = fidKey(user);
    return {
      ...user,
      viewer_context: {
        following: (following.get(viewerFid) ?? []).includes(key),
        followed_by: (following.get(key) ?? []).includes(viewerFid),
        blocking: false,
        blocked_by: false,
      },
    };
  }

  function stubUser(fid) {
    return {
      object: 'user',
      fid: BigInt(fid) >= 4294967296n ? String(fid) : Number(fid),
      username: `fid:${fid}`,
      custody_address: '',
      registered_at: '',
      profile: { bio: { text: '' } },
      follower_count: 0,
      following_count: 0,
      verifications: [],
      auth_addresses: [],
      verified_addresses: { eth_addresses: [], sol_addresses: [], primary: {} },
      verified_accounts: [],
    };
  }

  function conversationNode(cast, depth, maxDepth, viewerFid) {
    const children = [...casts.values()].filter((candidate) => candidate.parent_hash === cast.hash);
    return {
      ...withViewer(cast, viewerFid),
      direct_replies: depth >= maxDepth ? [] : children.map((child) => conversationNode(child, depth + 1, maxDepth, viewerFid)),
    };
  }

  const castPage = (list, query) => {
    const viewerFid = query.get('viewer_fid');
    const { items, next } = paginate(list, query);
    return json({ casts: items.map((cast) => withViewer(cast, viewerFid)), next });
  };
  const userPage = (fids, query) => {
    const viewerFid = query.get('viewer_fid');
    const { items, next } = paginate(fids, query);
    return json({ users: items.map((fid) => userFor(users.get(fid), viewerFid)), next });
  };
  const newestFirst = (list) => [...list].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  // --- router -------------------------------------------------------------

  /**
   * @param {string} pathname
   * @param {URLSearchParams} query
   * @returns {{ status: number, body: unknown, text?: string }}
   */
  function handle(pathname, query) {
    const viewerFid = query.get('viewer_fid');
    const fid = query.get('fid');
    const requireFid = () => (fid && /^\d+$/.test(fid) ? null : missingParam('fid'));

    switch (pathname) {
      case '/v1/info':
        return json({
          dbStats: { numMessages: casts.size, numFidRegistrations: users.size, approxSize: 1 },
          numShards: 2,
          shardInfos: [
            { shardId: 0, maxHeight: 1000, numMessages: 0, numFidRegistrations: 0, approxSize: 1, blockDelay: 1, mempoolSize: 0 },
            { shardId: 1, maxHeight: 2000, numMessages: casts.size, numFidRegistrations: users.size, approxSize: 1, blockDelay: 1, mempoolSize: 0 },
          ],
        });

      case '/v2/farcaster/feed/trending':
      case '/v2/farcaster/feed/for_you':
        return castPage(trendingOrder, query);

      case '/v2/farcaster/feed/following': {
        const error = requireFid();
        if (error) {
          return error;
        }
        const followed = following.get(fid) ?? [];
        return castPage(newestFirst([...casts.values()].filter((cast) => followed.includes(fidKey(cast.author)))), query);
      }

      case '/v2/farcaster/feed/user/casts': {
        const error = requireFid();
        if (error) {
          return error;
        }
        return castPage(newestFirst([...casts.values()].filter((cast) => fidKey(cast.author) === fid && !cast.parent_hash)), query);
      }

      case '/v2/farcaster/feed/user/replies_and_recasts': {
        const error = requireFid();
        if (error) {
          return error;
        }
        return castPage(newestFirst([...casts.values()].filter((cast) => fidKey(cast.author) === fid && cast.parent_hash)), query);
      }

      case '/v2/farcaster/feed/channels': {
        const id = query.get('channel_ids');
        if (!id) {
          return missingParam('channel_ids');
        }
        return castPage(newestFirst([...casts.values()].filter((cast) => (cast.parent_url ?? '').endsWith(`/~/channel/${id}`))), query);
      }

      case '/v2/farcaster/cast': {
        if (query.get('type') === 'url') {
          return json({ message: 'Only hash identifier type is supported' }, 400);
        }
        const cast = casts.get(normalizeHash(query.get('identifier')));
        return cast ? json({ cast: withViewer(cast, viewerFid) }) : notFound('Cast not found');
      }

      case '/v2/farcaster/cast/bulk': {
        const wanted = (query.get('hashes') ?? '').split(',').map(normalizeHash).filter(Boolean);
        return json({ casts: wanted.map((hash) => casts.get(hash)).filter(Boolean).map((cast) => withViewer(cast, viewerFid)) });
      }

      case '/v2/farcaster/cast/conversation': {
        const cast = casts.get(normalizeHash(query.get('identifier')));
        if (!cast) {
          return notFound('Cast not found');
        }
        const depth = Math.min(5, Number(query.get('reply_depth') ?? '2') || 0);
        return json({ conversation: { cast: conversationNode(cast, 0, depth, viewerFid) } });
      }

      case '/v2/farcaster/cast/quotes': {
        const target = normalizeHash(query.get('identifier'));
        return castPage([...casts.values()].filter((cast) => cast.embeds.some((embed) => embed.cast_id?.hash === target)), query);
      }

      case '/v2/farcaster/cast/search': {
        const needle = (query.get('q') ?? '').toLowerCase();
        if (needle === '__error__') {
          return json({ message: 'search index unavailable' }, 500);
        }
        const { items, next } = paginate(needle ? [...casts.values()].filter((cast) => cast.text.toLowerCase().includes(needle)) : [], query);
        return json({ result: { casts: items.map((cast) => withViewer(cast, viewerFid)), next } });
      }

      case '/v2/farcaster/user': {
        const error = requireFid();
        if (error) {
          return error;
        }
        return json({ user: users.has(fid) ? userFor(users.get(fid), viewerFid) : stubUser(fid) });
      }

      case '/v2/farcaster/user/by-username': {
        const name = query.get('username');
        const user = [...users.values()].find((candidate) => candidate.username === name);
        return user ? json({ user: userFor(user, viewerFid) }) : notFound('User not found');
      }

      case '/v2/farcaster/user/bulk': {
        const wanted = (query.get('fids') ?? '').split(',').filter(Boolean);
        return json({ users: wanted.map((key) => users.get(key)).filter(Boolean).map((user) => userFor(user, viewerFid)) });
      }

      case '/v2/farcaster/user/search': {
        const needle = (query.get('q') ?? '').toLowerCase();
        const matches = needle ? [...users.values()].filter((user) => !user.username.startsWith('fid:') && user.username.startsWith(needle)) : [];
        return json({ users: matches.slice(0, clampLimit(query)).map((user) => userFor(user, viewerFid)) });
      }

      case '/v2/farcaster/user/followers': {
        const error = requireFid();
        return error ?? userPage(followersOf.get(fid) ?? [], query);
      }

      case '/v2/farcaster/user/following': {
        const error = requireFid();
        return error ?? userPage(following.get(fid) ?? [], query);
      }

      case '/v2/farcaster/following/suggested': {
        const error = requireFid();
        if (error) {
          return error;
        }
        return json({ users: (suggestedFor.get(fid) ?? []).slice(0, clampLimit(query)).map((key) => users.get(key)), next: {} });
      }

      case '/v2/farcaster/user/channels':
        return json({ channels: channels.slice(0, 2), next: {} });

      case '/v2/farcaster/channel': {
        const channel = channels.find((candidate) => candidate.id === query.get('id'));
        return channel ? json({ channel }) : notFound('Channel not found');
      }

      case '/v2/farcaster/channel/trending':
        return json({ channels: channels.slice(0, clampLimit(query)), next: {} });

      case '/v2/farcaster/channel/all':
      case '/v2/farcaster/channel/list': {
        const { items, next } = paginate(channels, query);
        return json({ channels: items, next });
      }

      case '/v2/farcaster/channel/search': {
        const needle = (query.get('q') ?? '').toLowerCase();
        return json({ channels: needle ? channels.filter((channel) => channel.id.startsWith(needle)).slice(0, clampLimit(query)) : [], next: {} });
      }

      case '/v2/farcaster/channel/members': {
        const members = channelMembers.get(query.get('channel_id') ?? '');
        if (!members) {
          return notFound('Channel not found');
        }
        const { items, next } = paginate(members, query);
        return json({ members: items.map((user) => ({ object: 'channel_member', user, role: 'member' })), next });
      }

      case '/v2/farcaster/notifications': {
        const error = requireFid();
        if (error) {
          return error;
        }
        const { items, next } = paginate(notificationsFor.get(fid) ?? [], query);
        return json({
          notifications: items.map((entry) => ({ object: 'notification', type: entry.type, cast: entry.cast, user: entry.user, timestamp: iso(now - entry.minutesAgo * MINUTE) })),
          next,
        });
      }

      case '/v2/farcaster/reaction/cast': {
        const hash = normalizeHash(query.get('hash'));
        const cast = casts.get(hash);
        if (!cast) {
          return notFound('Cast not found');
        }
        const recasts = query.get('types') === 'recasts';
        const reactors = (recasts ? recastsOnCast : likesOnCast).get(hash) ?? [];
        return json({
          reactions: reactors.slice(0, clampLimit(query)).map((user, i) => ({
            object: recasts ? 'recasts' : 'likes',
            reaction_type: recasts ? 'recast' : 'like',
            reaction_timestamp: iso(now - (10 + i) * MINUTE),
            user,
            cast: { hash, fid: cast.author.fid },
          })),
          next: {},
        });
      }

      case '/v2/farcaster/reaction/user': {
        const error = requireFid();
        if (error) {
          return error;
        }
        const recasts = query.get('type') === 'recasts';
        const hashes = (recasts ? recastedBy : likedBy).get(fid) ?? [];
        return json({
          reactions: hashes.slice(0, clampLimit(query)).map((hash, i) => ({
            object: recasts ? 'recasts' : 'likes',
            reaction_type: recasts ? 'recast' : 'like',
            reaction_timestamp: iso(now - (60 + i) * MINUTE),
            user: users.get(fid),
            cast: { hash, fid: casts.get(hash)?.author.fid ?? 1 },
          })),
          next: {},
        });
      }

      default:
        return { status: 404, body: null, text: 'Not Found' };
    }
  }

  return {
    now,
    handle,
    hashOf,
    users: { ada, ben, chiyo, devon, esme, farid, gus, hana, nova, anon, fillers },
    casts: { launch, coast, walk, essay, quoting, nativeHello, noAvatar, clip, stream, anonCast, links, gm, unsafe, reply1, reply1a, reply1a1, reply2, reply3, orphan, fillerCasts },
    missingParentHash,
    channels,
  };
}
