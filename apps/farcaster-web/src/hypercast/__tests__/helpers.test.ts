import { describe, expect, it } from 'vitest';

import { formatCount, pluralize, timeAgo } from '~/hypercast/format';
import { groupNotifications } from '~/hypercast/notifications';
import { paths } from '~/hypercast/paths';
import { displayLink, segmentText } from '~/hypercast/text';
import { threadRows } from '~/hypercast/thread';
import { createFakeNode } from '~/hypersnap/fixtures/fakeNode';

const ADA = '1001';

describe('formatting', () => {
  it('shows short relative times, rounded down', () => {
    const now = Date.parse('2026-11-15T18:00:00Z');
    const ago = (ms: number) => timeAgo(now - ms, now);
    expect(ago(0)).toBe('0s');
    expect(ago(59_000)).toBe('59s');
    expect(ago(60_000)).toBe('1m');
    expect(ago(59 * 60_000)).toBe('59m');
    expect(ago(3 * 3_600_000)).toBe('3h');
    expect(ago(2 * 86_400_000)).toBe('2d');
    expect(ago(45 * 86_400_000)).toBe('1mo');
    expect(ago(800 * 86_400_000)).toBe('2y');
    // A clock that runs ahead never shows a negative age.
    expect(timeAgo(now + 5000, now)).toBe('0s');
    expect(timeAgo(null, now)).toBe('');
  });

  it('abbreviates counts the way the upstream interface does', () => {
    expect(
      [0, 7, 999, 1000, 1234, 9999, 12_345, 631_000, 999_600, 2_500_000].map(
        formatCount,
      ),
    ).toEqual([
      '0',
      '7',
      '999',
      '1K',
      '1.2K',
      '10K',
      '12K',
      '631K',
      '1M',
      '3M',
    ]);
    expect(formatCount(-4)).toBe('0');
    expect(formatCount(Number.NaN)).toBe('0');
    expect(pluralize(1, 'reply', 'replies')).toBe('reply');
    expect(pluralize(0, 'reply', 'replies')).toBe('replies');
  });
});

describe('links', () => {
  it('uses the username when there is one and the account number when not', async () => {
    const { api } = createFakeNode();
    const ada = await api.getUserByFid(ADA);
    const anon = await api.getUserByFid('4294967296');
    expect(paths.profile(ada)).toBe('/ada');
    expect(paths.profile(ada, 'replies')).toBe('/ada/casts-and-replies');
    expect(paths.followers(ada)).toBe('/ada/followers');
    expect(paths.profile(anon)).toBe('/~/profiles/4294967296');
    expect(paths.profile(anon, 'likes')).toBe('/~/profiles/4294967296/likes');
  });

  it('links a cast by its full hash, so the link survives a reload', async () => {
    const { api, world } = createFakeNode();
    const cast = await api.getCast(`0x${world.casts.launch.hash}`);
    expect(paths.cast(cast)).toBe(`/ada/0x${world.casts.launch.hash}`);
    expect(paths.castReactions(cast, 'likes')).toBe(
      `/ada/0x${world.casts.launch.hash}/reactions`,
    );
    const anonymous = await api.getCast(`0x${world.casts.anonCast.hash}`);
    expect(paths.cast(anonymous)).toBe(
      `/~/conversations/0x${world.casts.anonCast.hash}`,
    );
  });

  it('escapes what goes into a URL', () => {
    expect(paths.search('casts', 'a&b=c #x')).toBe(
      '/~/search/recent?q=a%26b%3Dc%20%23x',
    );
    expect(paths.search('users', '')).toBe('/~/search/users');
    expect(paths.channel('eip155:8453/erc20:0xabc')).toBe(
      '/~/channel/eip155%3A8453%2Ferc20%3A0xabc',
    );
  });
});

describe('cast text', () => {
  it('splits text into plain runs, mentions and links', async () => {
    const { api, world } = createFakeNode();
    const cast = await api.getCast(`0x${world.casts.walk.hash}`);
    const segments = segmentText(cast.text, cast.mentions);
    expect(segments.map((segment) => segment.kind)).toContain('mention');
    expect(
      segments.find((segment) => segment.kind === 'mention'),
    ).toMatchObject({ text: '@ada', fid: ADA });
    // Nothing is lost or duplicated.
    expect(segments.map((segment) => segment.text).join('')).toBe(cast.text);
  });

  it('only ever links to http and https', () => {
    const segments = segmentText(
      'see https://example.com/a?b=1 and javascript:alert(1) and data:text/html,x',
    );
    const links = segments.filter((segment) => segment.kind === 'link');
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ url: 'https://example.com/a?b=1' });
  });

  it('ignores mention spans that do not fit the text', () => {
    const segments = segmentText('hello', [
      { start: 40, end: 44, fid: '2', username: 'x' },
    ]);
    expect(segments).toEqual([{ kind: 'text', text: 'hello' }]);
  });

  it('shortens long links for display without changing where they go', () => {
    const long = `https://example.com/${'a'.repeat(100)}`;
    expect(displayLink(long).length).toBeLessThanOrEqual(49);
    expect(displayLink('https://example.com/x')).toBe('example.com/x');
  });
});

describe('notifications', () => {
  it('groups reactions to the same cast and follows, and keeps casts separate', async () => {
    const { api } = createFakeNode();
    const page = await api.getNotifications(ADA, { limit: 25 });
    const groups = groupNotifications(page.items);

    const likes = groups.find(
      (group) => group.kind === 'reaction' && group.reaction === 'like',
    );
    expect(
      likes && 'actors' in likes && likes.actors.map((actor) => actor.username),
    ).toEqual(['nova', 'farid', 'esme', 'chiyo', 'ben']);
    expect(
      groups
        .filter((group) => group.kind === 'cast')
        .map((group) => 'label' in group && group.label),
    ).toEqual(['quote', 'reply', 'reply', 'mention']);
    // One row per group, newest first, each with a distinct key.
    expect(new Set(groups.map((group) => group.key)).size).toBe(groups.length);
    const times = groups.map((group) => group.timestampMs ?? 0);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it('copes with an empty list', () => {
    expect(groupNotifications([])).toEqual([]);
  });
});

describe('thread layout', () => {
  it('follows a single chain of replies and reports what it leaves out', async () => {
    const { api, world } = createFakeNode();
    const conversation = await api.getConversation(
      `0x${world.casts.launch.hash}`,
    );
    const rows = conversation.replies.map(threadRows);

    // ben -> ada -> chiyo is one chain, drawn start / middle / end.
    expect(
      rows[0].map((row) => [row.cast.author.username, row.threadPosition]),
    ).toEqual([
      ['ben', 'start'],
      ['ada', 'middle'],
      ['chiyo', 'end'],
    ]);
    // A reply with no replies of its own stands alone.
    expect(rows[1].map((row) => row.threadPosition)).toEqual(['none']);
    expect(rows.flat().every((row) => row.hiddenReplies >= 0)).toBe(true);
  });
});
