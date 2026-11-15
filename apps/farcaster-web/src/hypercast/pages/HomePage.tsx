import { FC, memo } from 'react';

import { BorderedMainContent } from '~/components/BorderedMainContent';
import { CastFeed } from '~/hypercast/components/CastFeed';
import {
  PageHeader,
  PageTitle,
  TabLinks,
} from '~/hypercast/components/PageHeader';
import {
  ChooseAccount,
  PublicViewNotice,
} from '~/hypercast/pages/PublicViewNotice';
import { paths } from '~/hypercast/paths';
import { usePageTitle } from '~/hypercast/usePageTitle';
import { config } from '~/hypersnap/config';
import { useFollowingFeed, useTrendingFeed } from '~/hypersnap/hooks';
import { subjectFidOf, useSession } from '~/hypersnap/session';

const TrendingTab: FC = memo(() => {
  const feed = useTrendingFeed();
  return (
    <CastFeed
      feed={feed}
      subject="Trending feed"
      emptyMessage="Nothing is trending right now"
      emptySubMessage={`${config.nodeLabel} returned no trending casts.`}
    />
  );
});
TrendingTab.displayName = 'TrendingTab';

const FollowingTab: FC = memo(() => {
  const session = useSession();
  const feed = useFollowingFeed(subjectFidOf(session));

  if (session.mode === 'guest') {
    return <ChooseAccount what="its following feed" />;
  }

  return (
    <>
      <PublicViewNotice session={session} lead="Feed for" />
      <CastFeed
        feed={feed}
        subject="Following feed"
        emptyMessage="No casts in this feed"
        emptySubMessage="This account follows nobody yet, or the people it follows have not cast on this node."
      />
    </>
  );
});
FollowingTab.displayName = 'FollowingTab';

const HomePage: FC<{ tab: 'trending' | 'following' }> = memo(({ tab }) => {
  usePageTitle(tab === 'following' ? 'Following' : null);

  return (
    <BorderedMainContent>
      <PageHeader
        footer={
          <TabLinks
            tabs={[
              {
                label: 'Trending',
                to: paths.home(),
                isFocused: tab === 'trending',
              },
              {
                label: 'Following',
                to: paths.following(),
                isFocused: tab === 'following',
              },
            ]}
          />
        }
      >
        <PageTitle>Home</PageTitle>
      </PageHeader>
      {tab === 'trending' ? <TrendingTab /> : <FollowingTab />}
    </BorderedMainContent>
  );
});

HomePage.displayName = 'HomePage';

export { HomePage };
