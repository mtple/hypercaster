import { FC, memo } from 'react';

import { BorderedMainContent } from '~/components/BorderedMainContent';
import { ChannelRow } from '~/hypercast/components/ChannelRow';
import {
  PageHeader,
  PageTitle,
  TabLinks,
} from '~/hypercast/components/PageHeader';
import {
  EmptyView,
  ErrorView,
  LoadingView,
} from '~/hypercast/components/StateViews';
import { UserRow } from '~/hypercast/components/UserRow';
import { viewedLabel } from '~/hypercast/components/ViewAsDialog';
import { ChooseAccount } from '~/hypercast/pages/PublicViewNotice';
import { paths } from '~/hypercast/paths';
import { usePageTitle } from '~/hypercast/usePageTitle';
import { useSuggestedFollows, useTrendingChannels } from '~/hypersnap/hooks';
import { subjectFidOf, useSession } from '~/hypersnap/session';

const ChannelsTab: FC = memo(() => {
  const channels = useTrendingChannels(50);
  if (channels.isPending) {
    return <LoadingView label="Loading channels" />;
  }
  if (channels.isError) {
    return (
      <ErrorView
        error={channels.error}
        subject="Channels"
        onRetry={() => void channels.refetch()}
        isRetrying={channels.isFetching}
      />
    );
  }
  if (channels.data.length === 0) {
    return <EmptyView message="No trending channels right now" />;
  }
  return (
    <>
      <div className="border-b px-4 py-2 text-sm text-muted border-default">
        Channels with the most recent activity on this node.
      </div>
      {channels.data.map((channel) => (
        <ChannelRow key={channel.id} channel={channel} />
      ))}
    </>
  );
});
ChannelsTab.displayName = 'ChannelsTab';

const UsersTab: FC = memo(() => {
  const session = useSession();
  const suggested = useSuggestedFollows(subjectFidOf(session));

  if (session.mode === 'guest') {
    return <ChooseAccount what="accounts followed by the people it follows" />;
  }
  if (suggested.isPending) {
    return <LoadingView label="Loading suggestions" />;
  }
  if (suggested.isError) {
    return (
      <ErrorView
        error={suggested.error}
        subject="Suggestions"
        onRetry={() => void suggested.refetch()}
        isRetrying={suggested.isFetching}
      />
    );
  }
  return (
    <>
      <div className="border-b px-4 py-2 text-sm text-muted border-default">
        Accounts followed by people {viewedLabel(session)} follows, ranked by
        how many of them do. This comes from the public follow graph, not from a
        recommendation model.
      </div>
      {suggested.data.length === 0 ? (
        <EmptyView message="No suggestions for this account" />
      ) : (
        suggested.data.map((user) => <UserRow key={user.fid} user={user} />)
      )}
    </>
  );
});
UsersTab.displayName = 'UsersTab';

const ExplorePage: FC<{ tab: 'channels' | 'users' }> = memo(({ tab }) => {
  usePageTitle('Explore');
  return (
    <BorderedMainContent>
      <PageHeader
        footer={
          <TabLinks
            tabs={[
              {
                label: 'Channels',
                to: paths.explore(),
                isFocused: tab === 'channels',
              },
              {
                label: 'Users',
                to: paths.exploreUsers(),
                isFocused: tab === 'users',
              },
            ]}
          />
        }
      >
        <PageTitle>Explore</PageTitle>
      </PageHeader>
      {tab === 'channels' ? <ChannelsTab /> : <UsersTab />}
    </BorderedMainContent>
  );
});

ExplorePage.displayName = 'ExplorePage';

export { ExplorePage };
