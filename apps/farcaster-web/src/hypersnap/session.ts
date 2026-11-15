/**
 * Who the interface is acting for.
 *
 *   guest     nobody: public browsing only
 *   viewing   a public FID picked by the visitor; no ownership is implied
 *   signedIn  an account whose signing key is held in this browser
 *             (only reachable when the build has writes enabled)
 *
 * "viewing" and "signedIn" are stored separately so that picking an FID to
 * look at can never be mistaken for, or upgraded into, a signed-in session.
 */
import { useSyncExternalStore } from 'react';

import { config } from '~/hypersnap/config';
import { parseFid } from '~/hypersnap/ids';
import { readJson, remove, subscribe, writeJson } from '~/hypersnap/storage';
import type { Fid } from '~/hypersnap/types';

const VIEWING_KEY = 'viewing';
const ACCOUNT_KEY = 'account';

type ViewedProfile = { fid: Fid; username: string; displayName: string };

type StoredAccount = ViewedProfile & {
  /** Hex Ed25519 public key of the signer kept in this browser. */
  signerPublicKey: string;
  signedInAt: number;
};

type Session =
  | { mode: 'guest' }
  | ({ mode: 'viewing' } & ViewedProfile)
  | ({ mode: 'signedIn' } & StoredAccount);

const isViewedProfile = (value: unknown): value is ViewedProfile => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    parseFid(record.fid) === record.fid &&
    typeof record.username === 'string' &&
    typeof record.displayName === 'string'
  );
};

const isStoredAccount = (value: unknown): value is StoredAccount =>
  isViewedProfile(value) &&
  /^[0-9a-f]{64}$/.test(
    String((value as Record<string, unknown>).signerPublicKey),
  ) &&
  typeof (value as Record<string, unknown>).signedInAt === 'number';

let cachedKey = '';
let cachedSession: Session = { mode: 'guest' };

function readSession(writesEnabled: boolean = config.writesEnabled): Session {
  const account = writesEnabled ? readJson(ACCOUNT_KEY, isStoredAccount) : null;
  const viewing = readJson(VIEWING_KEY, isViewedProfile);
  const next: Session = account
    ? { mode: 'signedIn', ...account }
    : viewing
      ? { mode: 'viewing', ...viewing }
      : { mode: 'guest' };

  // useSyncExternalStore needs a stable reference while nothing changed.
  const key = JSON.stringify(next);
  if (key !== cachedKey) {
    cachedKey = key;
    cachedSession = next;
  }
  return cachedSession;
}

function setViewedProfile(profile: ViewedProfile): void {
  writeJson(VIEWING_KEY, {
    fid: profile.fid,
    username: profile.username,
    displayName: profile.displayName,
  });
}

function clearViewedProfile(): void {
  remove(VIEWING_KEY);
}

function setAccount(account: StoredAccount): void {
  writeJson(ACCOUNT_KEY, account);
}

function clearAccount(): void {
  remove(ACCOUNT_KEY);
}

function subscribeSession(listener: () => void): () => void {
  const unsubscribeViewing = subscribe(VIEWING_KEY, listener);
  const unsubscribeAccount = subscribe(ACCOUNT_KEY, listener);
  return () => {
    unsubscribeViewing();
    unsubscribeAccount();
  };
}

function useSession(): Session {
  return useSyncExternalStore(subscribeSession, readSession, readSession);
}

/** The FID whose following feed and notifications are shown, if any. */
const subjectFidOf = (session: Session): Fid | null =>
  session.mode === 'guest' ? null : session.fid;

/**
 * The FID whose own like / recast / follow state may be shown. Only a
 * signed-in account: showing a merely viewed FID's hearts as filled would
 * present someone else's activity as the visitor's own.
 */
const viewerFidOf = (session: Session): Fid | null =>
  session.mode === 'signedIn' ? session.fid : null;

export {
  clearAccount,
  clearViewedProfile,
  readSession,
  setAccount,
  setViewedProfile,
  subjectFidOf,
  useSession,
  viewerFidOf,
};
export type { Session, StoredAccount, ViewedProfile };
