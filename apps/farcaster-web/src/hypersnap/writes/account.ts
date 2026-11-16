/**
 * Signing in and out.
 *
 * Signing in means: the wallet shows it controls an account's custody
 * address, this browser makes a new signing key, the wallet approves that
 * key, and the node records it. From then on casts, likes, recasts and
 * follows are signed by the key in this browser, with no wallet prompt.
 *
 * Signing out revokes the key at the node where it can, then deletes it.
 */
import type { HypersnapApi } from '~/hypersnap/api';
import type { StoredAccount } from '~/hypersnap/session';
import type { Fid, User } from '~/hypersnap/types';
import { WriteError } from '~/hypersnap/writes/errors';
import {
  buildKeyAdd,
  buildKeyRemove,
  type CustodySigner,
} from '~/hypersnap/writes/keyAdd';
import { farcasterTime, type MessageSigner } from '~/hypersnap/writes/messages';
import type { MessagePoster } from '~/hypersnap/writes/poster';
import { toHex } from '~/hypersnap/writes/proto';
import {
  createKey,
  type KeyStore,
  type StoredKey,
  toMessageSigner,
} from '~/hypersnap/writes/signer';
import { submitMessage, type SubmitOptions } from '~/hypersnap/writes/submit';

const MAX_ACCOUNTS_SHOWN = 5;

type AccountDeps = {
  api: Pick<HypersnapApi, 'getCustodyFids' | 'getKeyNonce' | 'getUserByFid'>;
  poster: MessagePoster;
  keyStore: KeyStore;
  now?: () => number;
  createKey?: () => Promise<StoredKey>;
  submitOptions?: SubmitOptions;
};

/** The accounts on this node whose custody address is `address`. */
async function findAccounts(
  deps: Pick<AccountDeps, 'api'>,
  address: string,
): Promise<User[]> {
  const fids = await deps.api.getCustodyFids(address);
  if (fids.length === 0) {
    throw new WriteError(
      'no_account',
      'This wallet address is not the custody address of any account on this node. Sign in with the wallet that owns the account.',
    );
  }
  return Promise.all(
    fids.slice(0, MAX_ACCOUNTS_SHOWN).map((fid) => deps.api.getUserByFid(fid)),
  );
}

/**
 * Creates a signing key for `user`, has the wallet approve it, registers
 * it with the node, and only then keeps it. The wallet is prompted twice.
 */
async function signIn(
  deps: AccountDeps,
  params: { user: User; custody: CustodySigner },
): Promise<StoredAccount> {
  const { user, custody } = params;
  if (
    (user.custodyAddress ?? '').toLowerCase() !== custody.address.toLowerCase()
  ) {
    throw new WriteError(
      'no_account',
      'The connected wallet does not own this account.',
    );
  }

  const nowMs = (deps.now ?? Date.now)();
  const key = await (deps.createKey ?? createKey)();
  const lastNonce = await deps.api.getKeyNonce(user.fid);
  const message = await buildKeyAdd({
    fid: user.fid,
    custody,
    signer: toMessageSigner(key),
    // Higher than anything used before, including by other apps.
    nonce: Math.max(lastNonce + 1, Math.floor(nowMs / 1000)),
    timestamp: farcasterTime(nowMs),
  });
  await submitMessage(deps.poster, message, deps.submitOptions);
  await deps.keyStore.save(user.fid, key);

  return {
    fid: user.fid,
    username: user.username,
    displayName: user.displayName,
    signerPublicKey: toHex(key.publicKey),
    signedInAt: nowMs,
  };
}

/** The signing key for a signed-in account, or a clear "signed out". */
async function loadSigner(
  deps: Pick<AccountDeps, 'keyStore'>,
  account: Pick<StoredAccount, 'fid' | 'signerPublicKey'>,
): Promise<MessageSigner> {
  const key = await deps.keyStore.load(account.fid);
  if (key === null || toHex(key.publicKey) !== account.signerPublicKey) {
    throw new WriteError(
      'signed_out',
      'The signing key for this account is no longer in this browser. Sign in again.',
    );
  }
  return toMessageSigner(key);
}

/**
 * Deletes this browser's key. `revoked` says whether the node was also
 * told to stop accepting it; if not, the key simply expires unused.
 */
async function signOut(
  deps: Pick<AccountDeps, 'poster' | 'keyStore' | 'now' | 'submitOptions'>,
  account: { fid: Fid; signerPublicKey: string },
): Promise<{ revoked: boolean }> {
  let revoked = false;
  try {
    const signer = await loadSigner(deps, account);
    const nowMs = (deps.now ?? Date.now)();
    await submitMessage(
      deps.poster,
      await buildKeyRemove({
        fid: account.fid,
        signer,
        nonce: Math.floor(nowMs / 1000),
        timestamp: farcasterTime(nowMs),
      }),
      { ...deps.submitOptions, waitsMs: [] },
    );
    revoked = true;
  } catch {
    // Signing out must always work, even offline or with the key gone.
  }
  await deps.keyStore.remove(account.fid);
  return { revoked };
}

export { findAccounts, loadSigner, signIn, signOut };
export type { AccountDeps };
