/**
 * Bookmarks kept on this device only. They are a list of cast hashes; the
 * casts themselves are always re-read from the node.
 */
import { useSyncExternalStore } from 'react';

import { normalizeHash } from '~/hypersnap/ids';
import { readJson, remove, subscribe, writeJson } from '~/hypersnap/storage';
import type { CastHash } from '~/hypersnap/types';

const KEY = 'bookmarks';
const MAX_BOOKMARKS = 500;

type Bookmark = { hash: CastHash; savedAt: number };

const isBookmarkList = (value: unknown): value is Bookmark[] =>
  Array.isArray(value) &&
  value.every(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      normalizeHash((entry as Bookmark).hash) === (entry as Bookmark).hash &&
      typeof (entry as Bookmark).savedAt === 'number',
  );

const EMPTY: Bookmark[] = [];
let cachedRaw: string | null = null;
let cachedList: Bookmark[] = EMPTY;

/** Newest first. */
function readBookmarks(): Bookmark[] {
  const list = readJson(KEY, isBookmarkList) ?? EMPTY;
  const raw = JSON.stringify(list);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedList = list;
  }
  return cachedList;
}

function isBookmarked(hash: CastHash): boolean {
  return readBookmarks().some((bookmark) => bookmark.hash === hash);
}

/** Returns true when the cast is bookmarked after the call. */
function toggleBookmark(hash: CastHash, now: number = Date.now()): boolean {
  const current = readBookmarks();
  if (current.some((bookmark) => bookmark.hash === hash)) {
    writeJson(
      KEY,
      current.filter((bookmark) => bookmark.hash !== hash),
    );
    return false;
  }
  writeJson(KEY, [{ hash, savedAt: now }, ...current].slice(0, MAX_BOOKMARKS));
  return true;
}

function clearBookmarks(): void {
  remove(KEY);
}

const subscribeBookmarks = (listener: () => void) => subscribe(KEY, listener);

function useBookmarks(): Bookmark[] {
  return useSyncExternalStore(subscribeBookmarks, readBookmarks, readBookmarks);
}

function useIsBookmarked(hash: CastHash): boolean {
  return useBookmarks().some((bookmark) => bookmark.hash === hash);
}

export {
  clearBookmarks,
  isBookmarked,
  MAX_BOOKMARKS,
  readBookmarks,
  toggleBookmark,
  useBookmarks,
  useIsBookmarked,
};
export type { Bookmark };
