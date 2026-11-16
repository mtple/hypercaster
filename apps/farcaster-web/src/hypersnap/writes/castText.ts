/**
 * Turns what someone typed into the text, mentions and links of a cast.
 *
 * On the network a mention is not part of the text: the "@name" is removed
 * and the account's number is recorded with the byte position where it
 * belongs. Names that do not resolve to an account stay as plain text.
 */
import { safeHttpUrl } from '~/hypersnap/media';
import type { Fid } from '~/hypersnap/types';
import { MAX_EMBEDS, MAX_MENTIONS } from '~/hypersnap/writes/messages';
import { utf8 } from '~/hypersnap/writes/proto';

type PreparedText = {
  text: string;
  mentions: Fid[];
  mentionsPositions: number[];
};

// "@name" at the start, or after whitespace or an opening bracket.
const MENTION = /(^|[\s([{])@([a-z0-9][a-z0-9_.-]{0,62})/gi;
const URL_IN_TEXT = /https?:\/\/[^\s<>"'`]+/gi;

const byteLength = (text: string): number => utf8(text).length;

/** Candidate usernames in the text, lower-cased, in order, without repeats. */
function mentionCandidates(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(MENTION)) {
    const name = match[2].replace(/[._-]+$/, '').toLowerCase();
    if (name !== '' && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

/**
 * Removes resolved mentions from the text and records where they were.
 * `resolved` maps a lower-cased username to its account number.
 */
function extractMentions(
  input: string,
  resolved: ReadonlyMap<string, Fid>,
): PreparedText {
  let text = '';
  let cursor = 0;
  const mentions: Fid[] = [];
  const mentionsPositions: number[] = [];

  for (const match of input.matchAll(MENTION)) {
    const lead = match[1];
    const raw = match[2];
    const name = raw.replace(/[._-]+$/, '');
    const fid = resolved.get(name.toLowerCase());
    if (fid === undefined || mentions.length >= MAX_MENTIONS) {
      continue;
    }
    const start = (match.index ?? 0) + lead.length;
    text += input.slice(cursor, start);
    mentions.push(fid);
    mentionsPositions.push(byteLength(text));
    cursor = start + 1 + name.length;
  }
  text += input.slice(cursor);

  return { text, mentions, mentionsPositions };
}

/** Web links in the text, to attach so other clients can preview them. */
function linkEmbedsOf(text: string): string[] {
  const urls: string[] = [];
  for (const match of text.matchAll(URL_IN_TEXT)) {
    const candidate = match[0].replace(/[),.;:!?\]}]+$/, '');
    const url = safeHttpUrl(candidate);
    if (url !== null && !urls.includes(url) && byteLength(url) <= 256) {
      urls.push(url);
    }
    if (urls.length === MAX_EMBEDS) {
      break;
    }
  }
  return urls;
}

export { byteLength, extractMentions, linkEmbedsOf, mentionCandidates };
export type { PreparedText };
