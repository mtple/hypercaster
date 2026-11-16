import { describe, expect, it } from 'vitest';

import {
  byteLength,
  extractMentions,
  linkEmbedsOf,
  mentionCandidates,
} from '~/hypersnap/writes/castText';

const known = new Map([
  ['ada', '1001'],
  ['ben', '1002'],
  ['nova', '4294967301'],
  ['name.eth', '77'],
]);

describe('mentions', () => {
  it('finds candidate names once each, lower-cased, without trailing punctuation', () => {
    expect(
      mentionCandidates(
        '@Ada hi @ben, (@nova) @ada. mail me@example.com @name.eth.',
      ),
    ).toEqual(['ada', 'ben', 'nova', 'name.eth']);
  });

  it('removes resolved names and records byte positions', () => {
    expect(extractMentions('gm @ada and @ben!', known)).toEqual({
      text: 'gm  and !',
      mentions: ['1001', '1002'],
      mentionsPositions: [3, 8],
    });
  });

  it('measures positions in UTF-8 bytes', () => {
    const prepared = extractMentions('朝 @nova ✨', known);
    expect(prepared.text).toBe('朝  ✨');
    expect(prepared.mentionsPositions).toEqual([byteLength('朝 ')]);
    expect(prepared.mentions).toEqual(['4294967301']);
  });

  it('leaves unknown names and email addresses as plain text', () => {
    expect(
      extractMentions('hi @nobody, write to me@ada.example', known),
    ).toEqual({
      text: 'hi @nobody, write to me@ada.example',
      mentions: [],
      mentionsPositions: [],
    });
  });

  it('keeps punctuation that follows a name', () => {
    expect(extractMentions('thanks @name.eth.', known).text).toBe('thanks .');
  });

  it('stops at ten mentions and leaves the rest as text', () => {
    const text = Array.from({ length: 12 }, () => '@ada').join(' ');
    const prepared = extractMentions(text, known);
    expect(prepared.mentions).toHaveLength(10);
    expect(prepared.text.match(/@ada/g)).toHaveLength(2);
  });
});

describe('links to attach', () => {
  it('takes the first two distinct web links, without trailing punctuation', () => {
    expect(
      linkEmbedsOf(
        'See https://a.example/x, https://a.example/x and (https://b.example/y). Also https://c.example',
      ),
    ).toEqual(['https://a.example/x', 'https://b.example/y']);
  });

  it('ignores anything that is not an http(s) link', () => {
    expect(
      linkEmbedsOf('javascript:alert(1) ftp://x.example data:text/html,x'),
    ).toEqual([]);
  });
});
