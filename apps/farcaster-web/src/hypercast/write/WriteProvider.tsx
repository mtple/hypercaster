/**
 * The write controller for builds with writes switched on.
 *
 * Loaded lazily, and only when the build flag is set; a read-only build
 * never includes this file. Every action here sends exactly one signed
 * message and waits for the node's answer. A change is shown at once but
 * marked pending, and is undone if the node does not accept it.
 */
import { useQueryClient } from '@tanstack/react-query';
import cn from 'classnames';
import {
  FC,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Composer } from '~/hypercast/write/Composer';
import { SignInDialog } from '~/hypercast/write/SignInDialog';
import {
  type ComposerTarget,
  type Engagement,
  WriteContext,
  type WriteController,
} from '~/hypercast/write/WriteContext';
import { getCapabilities, unavailableReason } from '~/hypersnap/capabilities';
import { config } from '~/hypersnap/config';
import { handleOf } from '~/hypersnap/normalize';
import { queryKeys } from '~/hypersnap/queryKeys';
import {
  clearAccount,
  setAccount,
  type StoredAccount,
  useSession,
} from '~/hypersnap/session';
import type { Cast, CastHash, Fid, User } from '~/hypersnap/types';
import { loadSigner, signOut } from '~/hypersnap/writes/account';
import {
  type ActionDeps,
  createClock,
  removeCast,
  sendCast,
  setFollow,
  setReaction,
} from '~/hypersnap/writes/actions';
import { poster } from '~/hypersnap/writes/client';
import { isWriteError, WriteError } from '~/hypersnap/writes/errors';
import type { CastDraft, MessageSigner } from '~/hypersnap/writes/messages';
import { browserKeyStore } from '~/hypersnap/writes/signer';

type ReactionOverride = {
  liked?: boolean;
  recasted?: boolean;
  pending: boolean;
};
type FollowOverride = { following: boolean; pending: boolean };
type Notice = { id: number; text: string; tone: 'info' | 'error' };
type Dialog =
  | null
  | { kind: 'signIn' }
  | { kind: 'compose'; target: ComposerTarget };

const NOTICE_MS = 7000;
/** Long enough for a block to be produced before lists are read again. */
const REFRESH_DELAY_MS = 1500;

const WriteProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const session = useSession();
  const queryClient = useQueryClient();
  const account = session.mode === 'signedIn' ? session : null;
  const accountFid = account?.fid ?? null;
  const signerPublicKey = account?.signerPublicKey ?? null;

  const [reactions, setReactions] = useState<
    Record<CastHash, ReactionOverride>
  >({});
  const [follows, setFollows] = useState<Record<Fid, FollowOverride>>({});
  const [deleted, setDeleted] = useState<ReadonlySet<CastHash>>(new Set());
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const clock = useRef(createClock()).current;
  const signerRef = useRef<{ key: string; signer: MessageSigner } | null>(null);

  const say = useCallback((text: string, tone: Notice['tone'] = 'info') => {
    setNotice({ id: Date.now(), text, tone });
  }, []);

  useEffect(() => {
    if (!notice) {
      return undefined;
    }
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // What one account did is not shown as another's.
  useEffect(() => {
    setReactions({});
    setFollows({});
    signerRef.current = null;
  }, [accountFid]);

  const dropAccount = useCallback(
    (fid: Fid, reason: string) => {
      clearAccount();
      void browserKeyStore.remove(fid).catch(() => undefined);
      void queryClient.invalidateQueries({ queryKey: queryKeys.root });
      say(reason, 'error');
    },
    [queryClient, say],
  );

  /** Runs one action as the signed-in account, loading its key on demand. */
  const act = useCallback(
    async <T,>(run: (deps: ActionDeps) => Promise<T>): Promise<T> => {
      if (accountFid === null || signerPublicKey === null) {
        throw new Error('Not signed in');
      }
      try {
        if (signerRef.current?.key !== signerPublicKey) {
          signerRef.current = {
            key: signerPublicKey,
            signer: await loadSigner(
              { keyStore: browserKeyStore },
              { fid: accountFid, signerPublicKey },
            ),
          };
        }
        return await run({
          poster,
          fid: accountFid,
          signer: signerRef.current.signer,
          clock,
        });
      } catch (error) {
        const keyGone =
          isWriteError(error) &&
          (error.kind === 'signed_out' ||
            (error.kind === 'refused' && /signer/i.test(error.message)));
        if (keyGone) {
          const reason =
            'You have been signed out: this browser’s key is no longer accepted. Sign in again.';
          dropAccount(accountFid, reason);
          throw new WriteError('signed_out', reason);
        }
        throw error;
      }
    },
    [accountFid, clock, dropAccount, signerPublicKey],
  );

  const report = useCallback(
    (error: unknown) => {
      if (isWriteError(error) && error.kind === 'signed_out') {
        return; // already explained by dropAccount
      }
      say(
        isWriteError(error)
          ? error.message
          : 'That did not go through. Check your connection and try again.',
        'error',
      );
    },
    [say],
  );

  const refreshSoon = useCallback(() => {
    setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.root });
    }, REFRESH_DELAY_MS);
  }, [queryClient]);

  const engagementOf = useCallback(
    (cast: Cast): Engagement => {
      const base = {
        liked: cast.viewerContext?.liked ?? false,
        recasted: cast.viewerContext?.recasted ?? false,
      };
      const override = reactions[cast.hash];
      const liked = override?.liked ?? base.liked;
      const recasted = override?.recasted ?? base.recasted;
      const shift = (now: boolean, before: boolean) =>
        now === before ? 0 : now ? 1 : -1;
      return {
        liked,
        recasted,
        likesCount: Math.max(0, cast.likesCount + shift(liked, base.liked)),
        recastsCount: Math.max(
          0,
          cast.recastsCount + shift(recasted, base.recasted),
        ),
        pending: override?.pending ?? false,
      };
    },
    [reactions],
  );

  const toggleReaction = useCallback(
    (cast: Cast, reaction: 'like' | 'recast') => {
      const field = reaction === 'like' ? 'liked' : 'recasted';
      const current = engagementOf(cast);
      if (current.pending || accountFid === null) {
        return;
      }
      const next = !current[field];
      const settle = (value: boolean) =>
        setReactions((all) => ({
          ...all,
          [cast.hash]: { ...all[cast.hash], [field]: value, pending: false },
        }));
      setReactions((all) => ({
        ...all,
        [cast.hash]: { ...all[cast.hash], [field]: next, pending: true },
      }));
      act((deps) =>
        setReaction(
          deps,
          reaction,
          { fid: cast.author.fid, hash: cast.hash },
          next,
        ),
      ).then(
        () => settle(next),
        (error) => {
          settle(current[field]);
          report(error);
        },
      );
    },
    [accountFid, act, engagementOf, report],
  );

  const followStateOf = useCallback(
    (user: User) => {
      if (accountFid === null) {
        return null;
      }
      return (
        follows[user.fid] ?? {
          following: user.viewerContext?.following ?? false,
          pending: false,
        }
      );
    },
    [accountFid, follows],
  );

  const toggleFollow = useCallback(
    (user: User) => {
      const current = followStateOf(user);
      if (current === null || current.pending) {
        return;
      }
      const next = !current.following;
      const settle = (following: boolean) =>
        setFollows((all) => ({
          ...all,
          [user.fid]: { following, pending: false },
        }));
      setFollows((all) => ({
        ...all,
        [user.fid]: { following: next, pending: true },
      }));
      act((deps) => setFollow(deps, user.fid, next)).then(
        () => settle(next),
        (error) => {
          settle(current.following);
          report(error);
        },
      );
    },
    [act, followStateOf, report],
  );

  const deleteCast = useCallback(
    (cast: Cast) => {
      if (cast.author.fid !== accountFid) {
        return;
      }
      if (!window.confirm('Delete this cast? This cannot be undone.')) {
        return;
      }
      act((deps) => removeCast(deps, cast.hash)).then(() => {
        setDeleted((all) => new Set(all).add(cast.hash));
        say('Cast deleted.');
        refreshSoon();
      }, report);
    },
    [accountFid, act, refreshSoon, report, say],
  );

  const publish = useCallback(
    async (draft: CastDraft) => {
      await act((deps) => sendCast(deps, draft));
      say(`Sent to ${config.nodeLabel}. It can take a few seconds to appear.`);
      refreshSoon();
    },
    [act, refreshSoon, say],
  );

  const onSignedIn = useCallback(
    (next: StoredAccount) => {
      setAccount(next);
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.root });
      say(`Signed in as ${handleOf(next)}.`);
    },
    [queryClient, say],
  );

  const requestSignOut = useCallback(() => {
    if (account === null) {
      return;
    }
    if (
      !window.confirm(
        'Sign out? This browser’s signing key will be revoked and deleted.',
      )
    ) {
      return;
    }
    const { fid, signerPublicKey: key } = account;
    void signOut(
      { poster, keyStore: browserKeyStore },
      { fid, signerPublicKey: key },
    ).then(({ revoked }) => {
      clearAccount();
      void queryClient.invalidateQueries({ queryKey: queryKeys.root });
      say(
        revoked
          ? 'Signed out. This browser’s key was revoked and deleted.'
          : 'Signed out. The key was deleted here, but the node could not be told to revoke it; it will lapse unused.',
      );
    });
  }, [account, queryClient, say]);

  const controller = useMemo<WriteController>(
    () => ({
      capabilities: getCapabilities(config, session),
      unavailableReason: unavailableReason(config),
      signedInFid: accountFid,
      requestSignIn: () => setDialog({ kind: 'signIn' }),
      requestSignOut,
      toggleLike: (cast) => toggleReaction(cast, 'like'),
      toggleRecast: (cast) => toggleReaction(cast, 'recast'),
      toggleFollow,
      openComposer: (target = {}) => setDialog({ kind: 'compose', target }),
      deleteCast,
      engagementOf,
      followStateOf,
      isDeleted: (cast) => deleted.has(cast.hash),
    }),
    [
      accountFid,
      deleteCast,
      deleted,
      engagementOf,
      followStateOf,
      requestSignOut,
      session,
      toggleFollow,
      toggleReaction,
    ],
  );

  return (
    <WriteContext.Provider value={controller}>
      {children}
      {dialog?.kind === 'signIn' && (
        <SignInDialog onClose={() => setDialog(null)} onSignedIn={onSignedIn} />
      )}
      {dialog?.kind === 'compose' && accountFid !== null && (
        <Composer
          target={dialog.target}
          onClose={() => setDialog(null)}
          onSend={publish}
        />
      )}
      {notice && (
        <div
          key={notice.id}
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'fixed bottom-6 left-1/2 z-50 max-w-[min(480px,calc(100vw-32px))] -translate-x-1/2 rounded-lg border px-4 py-3 text-sm shadow-lg bg-app border-default',
            notice.tone === 'error' ? 'text-danger' : 'text-default',
          )}
        >
          {notice.text}
        </div>
      )}
    </WriteContext.Provider>
  );
};

export { WriteProvider };
