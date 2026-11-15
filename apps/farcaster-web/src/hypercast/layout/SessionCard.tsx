import { FC, memo, useState } from 'react';
import { Link } from 'react-router-dom';

import { DefaultButton } from '~/components/forms/buttons/DefaultButton';
import {
  useViewAs,
  ViewAsDialog,
  viewedLabel,
} from '~/hypercast/components/ViewAsDialog';
import { paths } from '~/hypercast/paths';
import { useWrites } from '~/hypercast/write/WriteContext';
import { useSession } from '~/hypersnap/session';

/**
 * States plainly who the interface is acting for. "Viewing" and "Signed in"
 * are worded and styled differently on purpose.
 */
const SessionCard: FC<{ variant?: 'rail' | 'inline' }> = memo(
  ({ variant = 'rail' }) => {
    const session = useSession();
    const writes = useWrites();
    const { stopViewing } = useViewAs();
    const [isPicking, setIsPicking] = useState(false);

    const container =
      variant === 'rail'
        ? 'rounded-xl p-4 bg-surface-secondary'
        : 'border-b p-4 border-default';

    return (
      <section aria-label="Who you are viewing as" className={container}>
        {session.mode === 'guest' && (
          <>
            <div className="text-base font-semibold text-default">
              Browsing as a guest
            </div>
            <p className="pt-1 text-sm text-muted">
              Pick any account to see its public following feed and
              notifications.
            </p>
            <div className="flex flex-row flex-wrap gap-2 pt-3">
              <DefaultButton
                variant="secondary"
                onClick={() => setIsPicking(true)}
              >
                View a public feed
              </DefaultButton>
              {writes.capabilities.canSignIn && (
                <DefaultButton onClick={writes.requestSignIn}>
                  Sign in
                </DefaultButton>
              )}
            </div>
          </>
        )}

        {session.mode === 'viewing' && (
          <>
            <div className="text-xs font-semibold uppercase tracking-wide text-faint">
              Public view
            </div>
            <div className="pt-1 text-base text-default">
              Viewing as{' '}
              <Link
                to={paths.profile(session)}
                className="font-semibold !text-inherit hover:underline"
              >
                {viewedLabel(session)}
              </Link>
            </div>
            <p className="pt-1 text-sm text-muted">
              You are looking at this account’s public data. You are not signed
              in.
            </p>
            <div className="flex flex-row flex-wrap gap-2 pt-3">
              <DefaultButton
                variant="secondary"
                onClick={() => setIsPicking(true)}
              >
                Change
              </DefaultButton>
              <DefaultButton variant="secondary" onClick={stopViewing}>
                Stop viewing
              </DefaultButton>
              {writes.capabilities.canSignIn && (
                <DefaultButton onClick={writes.requestSignIn}>
                  Sign in
                </DefaultButton>
              )}
            </div>
          </>
        )}

        {session.mode === 'signedIn' && (
          <>
            <div className="text-xs font-semibold uppercase tracking-wide text-faint">
              Signed in
            </div>
            <div className="pt-1 text-base text-default">
              Signed in as{' '}
              <Link
                to={paths.profile(session)}
                className="font-semibold !text-inherit hover:underline"
              >
                {viewedLabel(session)}
              </Link>
            </div>
            <p className="pt-1 text-sm text-muted">
              This browser holds a signing key for the account.
            </p>
            <div className="flex flex-row flex-wrap gap-2 pt-3">
              <DefaultButton
                variant="secondary"
                onClick={writes.requestSignOut}
              >
                Sign out
              </DefaultButton>
            </div>
          </>
        )}

        {isPicking && <ViewAsDialog onClose={() => setIsPicking(false)} />}
      </section>
    );
  },
);

SessionCard.displayName = 'SessionCard';

export { SessionCard };
