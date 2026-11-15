import { useQueryClient } from '@tanstack/react-query';
import { FC, FormEvent, memo, useCallback, useState } from 'react';

import { DefaultButton } from '~/components/forms/buttons/DefaultButton';
import { DefaultModalContainer } from '~/components/modals/DefaultModalContainer';
import { DefaultModalContent } from '~/components/modals/DefaultModalContent';
import { DefaultModalHeader } from '~/components/modals/DefaultModalHeader';
import { Modal } from '~/components/modals/Modal';
import { describeError } from '~/hypercast/components/StateViews';
import { api } from '~/hypersnap/client';
import { forgetSubject } from '~/hypersnap/hooks';
import { handleOf } from '~/hypersnap/normalize';
import {
  clearViewedProfile,
  setViewedProfile,
  subjectFidOf,
  useSession,
} from '~/hypersnap/session';
import type { User } from '~/hypersnap/types';

/**
 * Makes `user` the account whose public following feed and notifications
 * are shown. This changes what is displayed, nothing else.
 */
function useViewAs() {
  const queryClient = useQueryClient();
  const session = useSession();
  const previous = subjectFidOf(session);

  const viewAs = useCallback(
    (user: User) => {
      if (previous !== null && previous !== user.fid) {
        forgetSubject(queryClient, previous);
      }
      setViewedProfile({
        fid: user.fid,
        username: user.username,
        displayName: user.displayName,
      });
    },
    [previous, queryClient],
  );

  const stopViewing = useCallback(() => {
    if (previous !== null) {
      forgetSubject(queryClient, previous);
    }
    clearViewedProfile();
  }, [previous, queryClient]);

  return { viewAs, stopViewing };
}

type ViewAsDialogProps = {
  onClose: () => void;
};

const ViewAsDialog: FC<ViewAsDialogProps> = memo(({ onClose }) => {
  const { viewAs } = useViewAs();
  const [value, setValue] = useState('');
  const [isLooking, setIsLooking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const onSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const identifier = value.trim();
      if (identifier === '' || isLooking) {
        return;
      }
      setIsLooking(true);
      setProblem(null);
      try {
        const user = await api.resolveUser(identifier);
        viewAs(user);
        onClose();
      } catch (error) {
        const { title, detail } = describeError(error, 'Account');
        setProblem(`${title}. ${detail}`);
      } finally {
        setIsLooking(false);
      }
    },
    [isLooking, onClose, value, viewAs],
  );

  return (
    <Modal>
      <DefaultModalContainer onClose={onClose}>
        <DefaultModalContent minHeightPx={0}>
          <DefaultModalHeader title="View a public feed" onClose={onClose} />
          <form
            className="flex w-full flex-col gap-3 px-4 pb-4"
            onSubmit={onSubmit}
          >
            <p className="text-sm text-muted">
              Pick any account to see the feed of people it follows and its
              notifications. Both are public. This is not a sign-in, and it does
              not give you any control over the account.
            </p>
            <label className="flex flex-col gap-1 text-sm font-semibold text-default">
              Username or FID
              <input
                type="text"
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={64}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="e.g. dwr or 3"
                className="w-full rounded border bg-input p-2 text-sm font-normal border-default text-default"
              />
            </label>
            {problem && (
              <div role="alert" className="text-sm text-danger">
                {problem}
              </div>
            )}
            <DefaultButton
              type="submit"
              className="h-10 w-full"
              isLoading={isLooking}
              disabled={value.trim() === ''}
            >
              View feed
            </DefaultButton>
          </form>
        </DefaultModalContent>
      </DefaultModalContainer>
    </Modal>
  );
});
ViewAsDialog.displayName = 'ViewAsDialog';

/** "Feed for @name" style label for the account being viewed. */
const viewedLabel = (user: Pick<User, 'username' | 'fid'>): string =>
  handleOf(user);

export { useViewAs, ViewAsDialog, viewedLabel };
