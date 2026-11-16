import { FC, memo, useCallback, useState } from 'react';

import { DefaultButton } from '~/components/forms/buttons/DefaultButton';
import { DefaultModalContainer } from '~/components/modals/DefaultModalContainer';
import { DefaultModalContent } from '~/components/modals/DefaultModalContent';
import { DefaultModalHeader } from '~/components/modals/DefaultModalHeader';
import { Modal } from '~/components/modals/Modal';
import { Avatar } from '~/hypercast/components/Avatar';
import { describeError } from '~/hypercast/components/StateViews';
import { api } from '~/hypersnap/client';
import { config } from '~/hypersnap/config';
import { handleOf } from '~/hypersnap/normalize';
import type { StoredAccount } from '~/hypersnap/session';
import type { User } from '~/hypersnap/types';
import { findAccounts, signIn } from '~/hypersnap/writes/account';
import { poster } from '~/hypersnap/writes/client';
import { isWriteError } from '~/hypersnap/writes/errors';
import { browserKeyStore } from '~/hypersnap/writes/signer';
import {
  connectWallet,
  type Eip1193Provider,
  injectedProvider,
  walletCustodySigner,
} from '~/hypersnap/writes/wallet';

type Step =
  | { name: 'intro' }
  | { name: 'finding'; address: string }
  | { name: 'choose'; address: string; accounts: User[] }
  | { name: 'approving'; user: User };

/** While the wallet or node is answering the dialog cannot be dismissed. */
const ignore = () => undefined;

type SignInDialogProps = {
  onClose: () => void;
  onSignedIn: (account: StoredAccount) => void;
};

const shortAddress = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;

function explain(error: unknown): string {
  if (isWriteError(error)) {
    return error.message;
  }
  const { title, detail } = describeError(error, 'Account');
  return `${title}. ${detail}`;
}

const SignInDialog: FC<SignInDialogProps> = memo(({ onClose, onSignedIn }) => {
  const [step, setStep] = useState<Step>({ name: 'intro' });
  const [problem, setProblem] = useState<string | null>(null);
  const [provider] = useState<Eip1193Provider | null>(injectedProvider);

  const approve = useCallback(
    async (user: User, address: string) => {
      if (!provider) {
        return;
      }
      setProblem(null);
      setStep({ name: 'approving', user });
      try {
        const account = await signIn(
          { api, poster, keyStore: browserKeyStore },
          { user, custody: walletCustodySigner(provider, address) },
        );
        onSignedIn(account);
      } catch (error) {
        setProblem(explain(error));
        setStep({ name: 'intro' });
      }
    },
    [onSignedIn, provider],
  );

  const connect = useCallback(async () => {
    if (!provider) {
      return;
    }
    setProblem(null);
    try {
      const address = await connectWallet(provider);
      setStep({ name: 'finding', address });
      const accounts = await findAccounts({ api }, address);
      setStep({ name: 'choose', address, accounts });
    } catch (error) {
      setProblem(explain(error));
      setStep({ name: 'intro' });
    }
  }, [provider]);

  const isBusy = step.name === 'finding' || step.name === 'approving';

  return (
    <Modal>
      <DefaultModalContainer onClose={isBusy ? ignore : onClose}>
        <DefaultModalContent minHeightPx={0}>
          <DefaultModalHeader title="Sign in" onClose={onClose} />
          <div className="flex w-full flex-col gap-3 px-4 pb-4 text-sm text-muted">
            {step.name === 'intro' && (
              <>
                <p>
                  Sign in with the wallet that owns your account (its custody
                  address). Your wallet will be asked to approve a new signing
                  key for this browser. That key can cast, like, recast and
                  follow as you on {config.nodeLabel}, and nothing else.
                </p>
                <p>
                  {config.appName} never sees your wallet’s private key or
                  recovery phrase, and never asks your wallet to send a
                  transaction or spend anything.
                </p>
                {provider ? (
                  <DefaultButton className="h-10 w-full" onClick={connect}>
                    Connect wallet
                  </DefaultButton>
                ) : (
                  <p role="alert" className="text-default">
                    No browser wallet was found. Open this page in a browser
                    with a wallet extension, or in a wallet’s built-in browser,
                    and use the wallet that owns your account.
                  </p>
                )}
              </>
            )}

            {step.name === 'finding' && (
              <p role="status">
                Looking for accounts owned by {shortAddress(step.address)}… This
                can take a few seconds.
              </p>
            )}

            {step.name === 'choose' && (
              <>
                <p>
                  {shortAddress(step.address)} owns{' '}
                  {step.accounts.length === 1
                    ? 'this account'
                    : 'these accounts'}
                  . Choose one, then approve two requests in your wallet: one
                  for the key, one for what it may do.
                </p>
                <ul className="flex flex-col gap-2">
                  {step.accounts.map((user) => (
                    <li key={user.fid}>
                      <button
                        type="button"
                        onClick={() => void approve(user, step.address)}
                        className="flex w-full cursor-pointer flex-row items-center gap-3 rounded-lg border p-3 text-left border-default hover:bg-overlay-faint"
                      >
                        <Avatar user={user} size="md" disabled />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-semibold text-default">
                            {user.displayName}
                          </span>
                          <span className="truncate text-muted">
                            {handleOf(user)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {step.name === 'approving' && (
              <p role="status">
                Waiting for your wallet. Approve both requests to sign in as{' '}
                <span className="font-semibold text-default">
                  {handleOf(step.user)}
                </span>
                . Nothing is sent to the node until you do.
              </p>
            )}

            {problem && (
              <div role="alert" className="text-danger">
                {problem}
              </div>
            )}
          </div>
        </DefaultModalContent>
      </DefaultModalContainer>
    </Modal>
  );
});
SignInDialog.displayName = 'SignInDialog';

export { SignInDialog };
