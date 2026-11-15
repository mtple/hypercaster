import { FC, memo, ReactElement } from 'react';
import { useParams } from 'react-router-dom';

import { BorderedMainContent } from '~/components/BorderedMainContent';
import { DefaultButton } from '~/components/forms/buttons/DefaultButton';
import { FlatList } from '~/components/lists/FlatList';
import { CastFeed } from '~/hypercast/components/CastFeed';
import { ChannelGlyph, memberLabel } from '~/hypercast/components/ChannelRow';
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
import { paths } from '~/hypercast/paths';
import { usePageTitle } from '~/hypercast/usePageTitle';
import {
  useChannel,
  useChannelFeed,
  useChannelMembers,
} from '~/hypersnap/hooks';
import type { Channel, ChannelMember } from '~/hypersnap/types';

const ChannelFeedTab: FC<{ channel: Channel }> = memo(({ channel }) => {
  const feed = useChannelFeed(channel.id);
  return (
    <CastFeed
      feed={feed}
      subject="Channel feed"
      showChannel={false}
      emptyMessage="No casts in this channel yet"
    />
  );
});
ChannelFeedTab.displayName = 'ChannelFeedTab';

const memberKey = (member: ChannelMember) => member.user.fid;
const renderMember = ({ item }: { item: ChannelMember }): ReactElement => (
  <UserRow
    user={item.user}
    note={item.role !== '' && item.role !== 'member' ? item.role : undefined}
  />
);

const ChannelMembersTab: FC<{ channel: Channel }> = memo(({ channel }) => {
  const members = useChannelMembers(channel.id);
  if (members.isPending) {
    return <LoadingView label="Loading members" />;
  }
  if (members.isError && members.items.length === 0) {
    return (
      <ErrorView
        error={members.error}
        subject="Members"
        onRetry={() => void members.refetch()}
        isRetrying={members.isFetching}
      />
    );
  }
  return (
    <>
      <FlatList
        data={members.items}
        emptyView={<EmptyView message="No members listed" />}
        renderItem={renderMember}
        keyExtractor={memberKey}
        onEndReached={() => {
          if (members.hasNextPage && !members.isFetchingNextPage) {
            void members.fetchNextPage();
          }
        }}
        isFetchingNextPage={members.isFetchingNextPage}
      />
      {members.isFetchNextPageError && (
        <div
          role="alert"
          className="flex flex-col items-center gap-2 px-4 py-6 text-sm text-muted"
        >
          <div>Couldn’t load more.</div>
          <DefaultButton
            variant="secondary"
            size="sm"
            onClick={() => void members.fetchNextPage()}
          >
            Try again
          </DefaultButton>
        </div>
      )}
    </>
  );
});
ChannelMembersTab.displayName = 'ChannelMembersTab';

const ChannelPage: FC<{ tab: 'feed' | 'members' }> = memo(({ tab }) => {
  const { channelKey = '' } = useParams();
  const channel = useChannel(channelKey);
  usePageTitle(`/${channelKey}`);

  return (
    <BorderedMainContent>
      <PageHeader showBack visibleOnMobile>
        <PageTitle>/{channelKey}</PageTitle>
        <span className="truncate text-base font-semibold sm:hidden">
          /{channelKey}
        </span>
      </PageHeader>
      {channel.isPending ? (
        <LoadingView label="Loading channel" />
      ) : channel.isError ? (
        <ErrorView
          error={channel.error}
          subject="Channel"
          onRetry={() => void channel.refetch()}
          isRetrying={channel.isFetching}
        />
      ) : (
        <>
          <div className="flex flex-row items-center gap-3 p-4">
            <ChannelGlyph size={56} />
            <div className="flex min-w-0 flex-col">
              <h1 className="truncate text-lg font-bold leading-6 text-default">
                /{channel.data.id}
              </h1>
              {memberLabel(channel.data) !== '' && (
                <div className="text-base text-muted">
                  {memberLabel(channel.data)}
                </div>
              )}
              {channel.data.description && (
                <div className="pt-1 text-base text-default">
                  {channel.data.description}
                </div>
              )}
            </div>
          </div>
          <TabLinks
            tabs={[
              {
                label: 'Casts',
                to: paths.channel(channel.data.id),
                isFocused: tab === 'feed',
              },
              {
                label: 'Members',
                to: paths.channelMembers(channel.data.id),
                isFocused: tab === 'members',
              },
            ]}
          />
          {tab === 'feed' ? (
            <ChannelFeedTab channel={channel.data} />
          ) : (
            <ChannelMembersTab channel={channel.data} />
          )}
        </>
      )}
    </BorderedMainContent>
  );
});

ChannelPage.displayName = 'ChannelPage';

export { ChannelPage };
