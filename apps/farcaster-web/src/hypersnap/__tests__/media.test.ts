import {
  channelIdFromParentUrl,
  classifyUrl,
  isBrowsableChannelId,
  safeHttpUrl,
} from '~/hypersnap/media';

describe('safeHttpUrl', () => {
  it('allows http and https', () => {
    expect(safeHttpUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeHttpUrl(' http://example.com ')).toBe('http://example.com/');
  });

  it('rejects every other scheme and malformed input', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:x',
      'file:///etc/passwd',
      'ipfs://bafy',
      'chain://eip155:1/erc721:0xabc',
      '//example.com',
      'example.com',
      '',
      null,
      42,
      `https://example.com/${'a'.repeat(3000)}`,
      'https://user:pass@example.com/',
    ]) {
      expect(safeHttpUrl(bad)).toBeNull();
    }
  });
});

describe('classifyUrl', () => {
  it('recognises images by extension or image host', () => {
    expect(classifyUrl('https://cdn.example/pic.JPG?w=2')).toEqual({
      kind: 'image',
      url: 'https://cdn.example/pic.JPG?w=2',
    });
    expect(classifyUrl('https://imagedelivery.net/acct/abc-123/original')?.kind).toBe('image');
  });

  it('separates file video from streams', () => {
    expect(classifyUrl('https://v.example/a.mp4')).toMatchObject({ kind: 'video', streaming: false });
    expect(classifyUrl('https://v.example/a/master.m3u8')).toMatchObject({ kind: 'video', streaming: true });
  });

  it('treats everything else as a link and strips www', () => {
    expect(classifyUrl('https://www.example.com/post/1')).toEqual({
      kind: 'link',
      url: 'https://www.example.com/post/1',
      host: 'example.com',
    });
  });

  it('drops unsafe URLs entirely', () => {
    expect(classifyUrl('javascript:alert(1)')).toBeNull();
    expect(classifyUrl(undefined)).toBeNull();
  });
});

describe('channels', () => {
  it('reads the channel id from a parent URL on any host', () => {
    expect(channelIdFromParentUrl('https://warpcast.com/~/channel/memes')).toBe('memes');
    expect(channelIdFromParentUrl('https://channels.example/~/channel/Photo/')).toBe('photo');
  });

  it('ignores non-channel parents', () => {
    expect(channelIdFromParentUrl('https://example.com/article')).toBeNull();
    expect(channelIdFromParentUrl('chain://eip155:1/erc721:0xabc')).toBeNull();
    expect(channelIdFromParentUrl(null)).toBeNull();
  });

  it('filters token pseudo-channels out of lists', () => {
    expect(isBrowsableChannelId('base-africa')).toBe(true);
    expect(isBrowsableChannelId('eip155:8453/erc20:0xccd5')).toBe(false);
    expect(isBrowsableChannelId('')).toBe(false);
  });
});
