// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearBookmarks,
  isBookmarked,
  MAX_BOOKMARKS,
  readBookmarks,
  toggleBookmark,
} from '~/hypersnap/bookmarks';
import { getCapabilities, unavailableReason } from '~/hypersnap/capabilities';
import { createConfig } from '~/hypersnap/config';
import {
  clearAccount,
  clearViewedProfile,
  readSession,
  setAccount,
  setViewedProfile,
  subjectFidOf,
  viewerFidOf,
} from '~/hypersnap/session';
import {
  clearAll,
  NAMESPACE,
  readJson,
  subscribe,
  writeJson,
} from '~/hypersnap/storage';

const HASH = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;
const ada = { fid: '1001', username: 'ada', displayName: 'Ada' };
const account = { ...ada, signerPublicKey: 'ab'.repeat(32), signedInAt: 1 };

beforeEach(() => {
  localStorage.clear();
  clearAll();
});

describe('storage', () => {
  it('namespaces keys and leaves other data alone', () => {
    localStorage.setItem('user-saved-theme', 'dark');
    localStorage.setItem('someone-else', '1');
    writeJson('thing', { a: 1 });
    expect(localStorage.getItem(`${NAMESPACE}thing`)).toBe('{"a":1}');
    clearAll();
    expect(localStorage.getItem(`${NAMESPACE}thing`)).toBeNull();
    expect(localStorage.getItem('someone-else')).toBe('1');
  });

  it('returns null for missing, corrupt or wrongly shaped values', () => {
    const isNumber = (value: unknown): value is number =>
      typeof value === 'number';
    expect(readJson('n', isNumber)).toBeNull();
    localStorage.setItem(`${NAMESPACE}n`, '{not json');
    expect(readJson('n', isNumber)).toBeNull();
    localStorage.setItem(`${NAMESPACE}n`, '"text"');
    expect(readJson('n', isNumber)).toBeNull();
    writeJson('n', 4);
    expect(readJson('n', isNumber)).toBe(4);
  });

  it('tells subscribers about changes, until they unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe('k', listener);
    writeJson('k', 1);
    writeJson('other', 1);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    writeJson('k', 2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps working when the browser refuses to store anything', () => {
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('quota', 'QuotaExceededError');
      });
    expect(() => writeJson('k', { ok: true })).not.toThrow();
    setItem.mockRestore();
  });
});

describe('session', () => {
  it('starts as a guest with no subject and no viewer', () => {
    const session = readSession(false);
    expect(session).toEqual({ mode: 'guest' });
    expect(subjectFidOf(session)).toBeNull();
    expect(viewerFidOf(session)).toBeNull();
  });

  it('treats a viewed account as a subject but never as the viewer', () => {
    setViewedProfile(ada);
    const session = readSession(false);
    expect(session).toMatchObject({ mode: 'viewing', fid: '1001' });
    expect(subjectFidOf(session)).toBe('1001');
    // Viewing proves nothing, so nothing is presented as "yours".
    expect(viewerFidOf(session)).toBeNull();
    clearViewedProfile();
    expect(readSession(false)).toEqual({ mode: 'guest' });
  });

  it('ignores a stored account entirely in a read-only build', () => {
    setAccount(account);
    expect(readSession(false)).toEqual({ mode: 'guest' });
    const signedIn = readSession(true);
    expect(signedIn).toMatchObject({ mode: 'signedIn', fid: '1001' });
    expect(viewerFidOf(signedIn)).toBe('1001');
    clearAccount();
    expect(readSession(true)).toEqual({ mode: 'guest' });
  });

  it('rejects tampered session data', () => {
    for (const bad of [
      { fid: 12, username: 'a', displayName: 'A' },
      { fid: '0', username: 'a', displayName: 'A' },
      { fid: '5' },
      'ada',
      null,
    ]) {
      localStorage.setItem(`${NAMESPACE}viewing`, JSON.stringify(bad));
      writeJson('poke', Math.random());
      expect(readSession(false).mode).toBe('guest');
    }
    localStorage.setItem(
      `${NAMESPACE}account`,
      JSON.stringify({ ...account, signerPublicKey: 'zz' }),
    );
    expect(readSession(true).mode).toBe('guest');
  });
});

describe('capabilities', () => {
  it('are all off in a read-only build, whoever is being viewed', () => {
    for (const session of [
      { mode: 'guest' as const },
      { mode: 'viewing' as const, ...ada },
      { mode: 'signedIn' as const, ...account },
    ]) {
      const capabilities = getCapabilities({ writesEnabled: false }, session);
      expect(
        Object.values(capabilities).every((value) => value === false),
      ).toBe(true);
    }
    expect(unavailableReason({ writesEnabled: false })).toMatch(
      /Read-only preview/,
    );
  });

  it('with writes on, offer sign-in until signed in, then the actions', () => {
    const guest = getCapabilities(
      { writesEnabled: true },
      { mode: 'viewing', ...ada },
    );
    expect(guest).toMatchObject({
      canSignIn: true,
      canPost: false,
      canLike: false,
      canFollow: false,
    });
    const signedIn = getCapabilities(
      { writesEnabled: true },
      { mode: 'signedIn', ...account },
    );
    expect(signedIn).toMatchObject({
      canSignIn: false,
      canPost: true,
      canReply: true,
      canLike: true,
      canRecast: true,
      canFollow: true,
      canDeleteOwnCast: true,
      canEditProfile: false,
      canUploadMedia: false,
    });
  });
});

describe('configuration', () => {
  it('defaults to read-only and only an exact "true" turns writes on', () => {
    expect(createConfig({}).writesEnabled).toBe(false);
    for (const value of ['1', 'yes', 'TRUE', ' true', 'on']) {
      expect(createConfig({ VITE_ENABLE_WRITES: value }).writesEnabled).toBe(
        false,
      );
    }
    expect(createConfig({ VITE_ENABLE_WRITES: 'true' }).writesEnabled).toBe(
      true,
    );
  });

  it('accepts an https node or a same-origin path and rejects the rest', () => {
    expect(
      createConfig({ VITE_HYPERSNAP_URL: 'https://node.example/' }).nodeUrl,
    ).toBe('https://node.example');
    expect(createConfig({ VITE_HYPERSNAP_URL: '/hs' }).nodeUrl).toBe('/hs');
    for (const bad of [
      'javascript:alert(1)',
      'ftp://node.example',
      'node.example',
      'https://user:pass@node.example',
    ]) {
      expect(() => createConfig({ VITE_HYPERSNAP_URL: bad })).toThrow();
    }
  });
});

describe('bookmarks', () => {
  it('toggle, list newest first, and survive a reload of the module state', () => {
    expect(toggleBookmark(HASH(1), 10)).toBe(true);
    expect(toggleBookmark(HASH(2), 20)).toBe(true);
    expect(readBookmarks().map((bookmark) => bookmark.hash)).toEqual([
      HASH(2),
      HASH(1),
    ]);
    expect(isBookmarked(HASH(1))).toBe(true);
    expect(toggleBookmark(HASH(1), 30)).toBe(false);
    expect(isBookmarked(HASH(1))).toBe(false);
    clearBookmarks();
    expect(readBookmarks()).toEqual([]);
  });

  it('are capped, dropping the oldest', () => {
    for (let i = 0; i < MAX_BOOKMARKS + 5; i += 1) {
      toggleBookmark(HASH(i + 1), i);
    }
    const all = readBookmarks();
    expect(all).toHaveLength(MAX_BOOKMARKS);
    expect(all[0].hash).toBe(HASH(MAX_BOOKMARKS + 5));
    expect(isBookmarked(HASH(1))).toBe(false);
  });

  it('ignores stored data that is not a bookmark list', () => {
    localStorage.setItem(
      `${NAMESPACE}bookmarks`,
      JSON.stringify([{ hash: '<script>', savedAt: 'x' }]),
    );
    writeJson('poke', 1);
    expect(readBookmarks()).toEqual([]);
  });
});
