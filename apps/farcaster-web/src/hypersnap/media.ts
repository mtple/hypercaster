import type { Embed } from '~/hypersnap/types';

const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'bmp',
  'svg',
]);
const FILE_VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v']);
const STREAM_VIDEO_EXTENSIONS = new Set(['m3u8']);

/**
 * Hosts that serve images from extension-less URLs. Generic image delivery
 * services only; nothing here is an API.
 */
const IMAGE_HOSTS = new Set(['imagedelivery.net', 'i.imgur.com']);

/**
 * Returns a normalised http(s) URL, or null for anything else. Every URL
 * that came from the network goes through this before it is rendered, so
 * "javascript:", "data:" and friends never reach an href or src.
 */
function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > 2048) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return null;
  }
  if (parsed.username !== '' || parsed.password !== '') {
    return null;
  }
  return parsed.href;
}

function extensionOf(pathname: string): string {
  const lastSegment = pathname.split('/').pop() ?? '';
  const dot = lastSegment.lastIndexOf('.');
  return dot === -1 ? '' : lastSegment.slice(dot + 1).toLowerCase();
}

/**
 * The node returns embeds as bare URLs with no content type, so the kind is
 * inferred from the URL alone. Anything unrecognised is a plain link.
 */
function classifyUrl(value: unknown): Embed | null {
  const url = safeHttpUrl(value);
  if (url === null) {
    return null;
  }
  const parsed = new URL(url);
  const extension = extensionOf(parsed.pathname);

  if (STREAM_VIDEO_EXTENSIONS.has(extension)) {
    return { kind: 'video', url, streaming: true };
  }
  if (FILE_VIDEO_EXTENSIONS.has(extension)) {
    return { kind: 'video', url, streaming: false };
  }
  if (IMAGE_EXTENSIONS.has(extension) || IMAGE_HOSTS.has(parsed.hostname)) {
    return { kind: 'image', url };
  }
  return { kind: 'link', url, host: parsed.hostname.replace(/^www\./, '') };
}

const CHANNEL_PATH = /^\/~\/channel\/([A-Za-z0-9][A-Za-z0-9_-]{0,63})\/?$/;

/**
 * Channels are identified on the protocol by a parent URL whose path ends
 * in "/~/channel/<id>". The host is not checked: it is data, not a service
 * this client talks to.
 */
function channelIdFromParentUrl(value: unknown): string | null {
  const url = safeHttpUrl(value);
  if (url === null) {
    return null;
  }
  const match = CHANNEL_PATH.exec(new URL(url).pathname);
  return match ? match[1].toLowerCase() : null;
}

const BROWSABLE_CHANNEL_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/** The node also lists token and chain URLs as channels; those have no page. */
const isBrowsableChannelId = (id: string): boolean =>
  BROWSABLE_CHANNEL_ID.test(id);

export { channelIdFromParentUrl, classifyUrl, isBrowsableChannelId, safeHttpUrl };
