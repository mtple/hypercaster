/**
 * Splits cast and bio text into plain runs, mentions and links.
 *
 * Mentions come from the node as explicit spans. Links are detected here;
 * only http(s) targets survive, so nothing a person typed can become a
 * script or data URL.
 */
import LinkifyIt from 'linkify-it';

import { safeHttpUrl } from '~/hypersnap/media';
import type { Fid, MentionSpan } from '~/hypersnap/types';

type TextSegment =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; text: string; fid: Fid; username: string }
  | { kind: 'link'; text: string; url: string };

const linkify = new LinkifyIt(undefined, {
  fuzzyEmail: false,
  fuzzyIP: false,
  fuzzyLink: true,
});
// No "mailto:" or protocol-relative links.
linkify.add('mailto:', null).add('//', null);

function linkSegments(text: string): TextSegment[] {
  if (text === '') {
    return [];
  }
  const matches = linkify.match(text);
  if (!matches) {
    return [{ kind: 'text', text }];
  }

  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const match of matches) {
    const url = safeHttpUrl(match.url);
    if (url === null) {
      continue;
    }
    if (match.index > cursor) {
      segments.push({ kind: 'text', text: text.slice(cursor, match.index) });
    }
    segments.push({ kind: 'link', text: match.raw, url });
    cursor = match.lastIndex;
  }
  if (cursor < text.length) {
    segments.push({ kind: 'text', text: text.slice(cursor) });
  }
  return segments;
}

function segmentText(
  text: string,
  mentions: MentionSpan[] = [],
): TextSegment[] {
  const ordered = [...mentions]
    .filter(
      (mention) =>
        mention.start >= 0 &&
        mention.end > mention.start &&
        mention.end <= text.length,
    )
    .sort((a, b) => a.start - b.start);

  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const mention of ordered) {
    if (mention.start < cursor) {
      continue;
    }
    segments.push(...linkSegments(text.slice(cursor, mention.start)));
    segments.push({
      kind: 'mention',
      text: text.slice(mention.start, mention.end),
      fid: mention.fid,
      username: mention.username,
    });
    cursor = mention.end;
  }
  segments.push(...linkSegments(text.slice(cursor)));
  return segments;
}

/** Shortens long link text for display; the href keeps the full URL. */
function displayLink(text: string, max = 48): string {
  const withoutScheme = text.replace(/^https?:\/\//, '');
  return withoutScheme.length > max
    ? `${withoutScheme.slice(0, max - 1)}…`
    : withoutScheme;
}

export { displayLink, segmentText };
export type { TextSegment };
