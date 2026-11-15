import { FC, memo, useState } from 'react';
import { Link } from 'react-router-dom';

import { DefaultButton } from '~/components/forms/buttons/DefaultButton';
import { EmptyView } from '~/hypercast/components/StateViews';
import { ViewAsDialog, viewedLabel } from '~/hypercast/components/ViewAsDialog';
import { paths } from '~/hypercast/paths';
import { useWrites } from '~/hypercast/write/WriteContext';
import type { Session } from '~/hypersnap/session';

/** Shown instead of a per-account screen when no account is selected. */
const ChooseAccount: FC<{ what: string }> = memo(({ what }) => {
  const writes = useWrites();
  const [isPicking, setIsPicking] = useState(false);
  return (
    <>
      <EmptyView
        message={`Pick an account to see ${what}`}
        subMessage="Any account’s following feed and notifications are public. Choosing one is not a sign-in."
      >
        <div className="flex flex-row flex-wrap justify-center gap-2">
          <DefaultButton onClick={() => setIsPicking(true)}>
            View a public feed
          </DefaultButton>
          {writes.capabilities.canSignIn && (
            <DefaultButton variant="secondary" onClick={writes.requestSignIn}>
              Sign in
            </DefaultButton>
          )}
        </div>
      </EmptyView>
      {isPicking && <ViewAsDialog onClose={() => setIsPicking(false)} />}
    </>
  );
});
ChooseAccount.displayName = 'ChooseAccount';

type PublicViewNoticeProps = {
  session: Exclude<Session, { mode: 'guest' }>;
  /** e.g. "Feed for" or "Notifications for". */
  lead: string;
};

/**
 * A strip above per-account screens saying whose data this is. For a
 * viewed account it says, every time, that this is a public view.
 */
const PublicViewNotice: FC<PublicViewNoticeProps> = memo(
  ({ session, lead }) => {
    const [isPicking, setIsPicking] = useState(false);
    const profileLink = (
      <Link
        to={paths.profile(session)}
        className="font-semibold !text-inherit hover:underline"
      >
        {viewedLabel(session)}
      </Link>
    );

    if (session.mode === 'signedIn') {
      return (
        <div className="border-b px-4 py-2 text-sm text-muted border-default">
          Signed in as {profileLink}
        </div>
      );
    }

    return (
      <>
        <div className="flex flex-row items-center justify-between gap-3 border-b px-4 py-2 text-sm text-muted border-default">
          <div className="min-w-0">
            {lead} {profileLink}
            <span className="text-faint"> · public view, not a sign-in</span>
          </div>
          <button
            type="button"
            className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-sm text-link hover:underline"
            onClick={() => setIsPicking(true)}
          >
            Change
          </button>
        </div>
        {isPicking && <ViewAsDialog onClose={() => setIsPicking(false)} />}
      </>
    );
  },
);
PublicViewNotice.displayName = 'PublicViewNotice';

export { ChooseAccount, PublicViewNotice };
