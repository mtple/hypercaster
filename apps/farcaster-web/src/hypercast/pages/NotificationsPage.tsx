import { FC, memo, ReactElement, useMemo } from 'react';

import { BorderedMainContent } from '~/components/BorderedMainContent';
import { DefaultButton } from '~/components/forms/buttons/DefaultButton';
import { FlatList } from '~/components/lists/FlatList';
import { NotificationRow } from '~/hypercast/components/NotificationList';
import { PageHeader, PageTitle } from '~/hypercast/components/PageHeader';
import {
  EmptyView,
  ErrorView,
  LoadingView,
} from '~/hypercast/components/StateViews';
import { viewedLabel } from '~/hypercast/components/ViewAsDialog';
import {
  groupNotifications,
  type NotificationGroup,
} from '~/hypercast/notifications';
import {
  ChooseAccount,
  PublicViewNotice,
} from '~/hypercast/pages/PublicViewNotice';
import { usePageTitle } from '~/hypercast/usePageTitle';
import { type CastContext, useNotifications } from '~/hypersnap/hooks';
import { subjectFidOf, useSession } from '~/hypersnap/session';

const keyOf = (group: NotificationGroup) => group.key;

type Extra = { isOwn: boolean; subjectHandle: string; context: CastContext };

const renderGroup = ({
  item,
  extra,
}: {
  item: NotificationGroup;
  extra?: Extra;
}): ReactElement => (
  <NotificationRow
    group={item}
    isOwn={extra!.isOwn}
    subjectHandle={extra!.subjectHandle}
    context={extra!.context}
  />
);

const NotificationsPage: FC = memo(() => {
  usePageTitle('Notifications');
  const session = useSession();
  const list = useNotifications(subjectFidOf(session));
  const groups = useMemo(() => groupNotifications(list.items), [list.items]);

  return (
    <BorderedMainContent>
      <PageHeader
        onRefresh={
          session.mode === 'guest' ? undefined : () => void list.refetch()
        }
        isRefreshing={list.isRefetching}
      >
        <PageTitle>Notifications</PageTitle>
      </PageHeader>
      {session.mode === 'guest' ? (
        <ChooseAccount what="its notifications" />
      ) : (
        <>
          <PublicViewNotice session={session} lead="Notifications for" />
          {list.isPending ? (
            <LoadingView label="Loading notifications" />
          ) : list.isError && groups.length === 0 ? (
            <ErrorView
              error={list.error}
              subject="Notifications"
              onRetry={() => void list.refetch()}
              isRetrying={list.isFetching}
            />
          ) : (
            <>
              <FlatList
                data={groups}
                extraProps={{
                  isOwn: session.mode === 'signedIn',
                  subjectHandle: viewedLabel(session),
                  context: list.context,
                }}
                emptyView={
                  <EmptyView
                    message="No notifications"
                    subMessage="Nothing has happened to this account on this node yet."
                  />
                }
                renderItem={renderGroup}
                keyExtractor={keyOf}
                onEndReached={() => {
                  if (list.hasNextPage && !list.isFetchingNextPage) {
                    void list.fetchNextPage();
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
                    onClick={() => void list.fetchNextPage()}
                  >
                    Try again
                  </DefaultButton>
                </div>
              )}
            </>
          )}
        </>
      )}
    </BorderedMainContent>
  );
});

NotificationsPage.displayName = 'NotificationsPage';

export { NotificationsPage };
