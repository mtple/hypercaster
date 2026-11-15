import classNames from 'classnames';
import { FC, memo, ReactElement, ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { DefaultButton } from '~/components/forms/buttons/DefaultButton';
import { FlatList } from '~/components/lists/FlatList';
import { Avatar } from '~/hypercast/components/Avatar';
import {
  EmptyView,
  ErrorView,
  LoadingView,
} from '~/hypercast/components/StateViews';
import { paths } from '~/hypercast/paths';
import { useWrites } from '~/hypercast/write/WriteContext';
import { handleOf } from '~/hypersnap/normalize';
import type { User } from '~/hypersnap/types';

/**
 * Follow / Following. Rendered only in builds where following is possible;
 * a read-only build shows no follow control at all, like the upstream
 * signed-out interface.
 */
const FollowButton: FC<{ user: User; size?: 'sm' | 'md' }> = memo(
  ({ user, size = 'md' }) => {
    const writes = useWrites();
    const { capabilities } = writes;

    if (!capabilities.canFollow && !capabilities.canSignIn) {
      return null;
    }
    if (writes.signedInFid === user.fid) {
      return null;
    }

    const state = writes.followStateOf(user);
    const following = state?.following ?? false;

    return (
      <DefaultButton
        size={size}
        variant={following ? 'secondary' : 'normal'}
        isLoading={state?.pending ?? false}
        aria-pressed={following}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (capabilities.canFollow) {
            writes.toggleFollow(user);
          } else {
            writes.requestSignIn();
          }
        }}
      >
        {following ? 'Following' : 'Follow'}
      </DefaultButton>
    );
  },
);
FollowButton.displayName = 'FollowButton';

type UserRowProps = {
  user: User;
  /** Shown under the handle, e.g. a channel role. */
  note?: string;
  action?: ReactNode;
  skipSeparator?: boolean;
};

const UserRow: FC<UserRowProps> = memo(
  ({ user, note, action, skipSeparator = false }) => (
    <div
      className={classNames(
        'relative flex flex-row items-center justify-between px-3 py-2 border-default hover:bg-overlay-faint',
        !skipSeparator && 'border-b',
      )}
    >
      <Link
        to={paths.profile(user)}
        title={user.displayName}
        className="absolute inset-0"
      />
      <div className="flex min-w-0 shrink flex-row gap-3">
        <Avatar user={user} className="mr-2" size="sm" disabled />
        <div className="min-w-0 shrink">
          <div className="flex min-w-0 flex-row items-center space-x-1">
            <div className="truncate text-base font-semibold text-default">
              {user.displayName}
            </div>
            {user.viewerContext?.followedBy && (
              <div className="shrink-0 rounded border px-2 py-0.5 text-xs text-muted border-default">
                Follows you
              </div>
            )}
          </div>
          <div className="line-clamp-2 text-sm text-muted">
            {handleOf(user)}
            {note ? ` · ${note}` : ''}
          </div>
        </div>
      </div>
      <div className="relative shrink-0 pl-2">
        {action !== undefined ? action : <FollowButton user={user} />}
      </div>
    </div>
  ),
);
UserRow.displayName = 'UserRow';

type UserListProps = {
  list: {
    items: User[];
    isPending: boolean;
    isError: boolean;
    error: unknown;
    isFetching: boolean;
    hasNextPage?: boolean;
    isFetchingNextPage?: boolean;
    isFetchNextPageError?: boolean;
    fetchNextPage?: () => unknown;
    refetch: () => unknown;
  };
  subject?: string;
  emptyMessage: string;
  emptySubMessage?: string;
};

const userKey = (user: User) => user.fid;
const renderUser = ({ item }: { item: User }): ReactElement => (
  <UserRow user={item} />
);

const UserList: FC<UserListProps> = memo(
  ({ list, subject = 'List', emptyMessage, emptySubMessage }) => {
    if (list.isPending) {
      return <LoadingView label={`Loading ${subject.toLowerCase()}`} />;
    }
    if (list.isError && list.items.length === 0) {
      return (
        <ErrorView
          error={list.error}
          subject={subject}
          onRetry={() => void list.refetch()}
          isRetrying={list.isFetching}
        />
      );
    }
    return (
      <>
        <FlatList
          data={list.items}
          emptyView={
            <EmptyView message={emptyMessage} subMessage={emptySubMessage} />
          }
          renderItem={renderUser}
          keyExtractor={userKey}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) {
              void list.fetchNextPage?.();
            }
          }}
          isFetchingNextPage={list.isFetchingNextPage}
        />
        {list.isFetchNextPageError && (
          <div
            role="alert"
            className="flex flex-col items-center gap-2 px-4 py-6 text-sm text-muted"
          >
            <div>Couldn’t load more.</div>
            <DefaultButton
              variant="secondary"
              size="sm"
              onClick={() => void list.fetchNextPage?.()}
            >
              Try again
            </DefaultButton>
          </div>
        )}
      </>
    );
  },
);
UserList.displayName = 'UserList';

export { FollowButton, UserList, UserRow };
