import { FC, memo, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { BorderedMainContent } from '~/components/BorderedMainContent';
import { CastFeed } from '~/hypercast/components/CastFeed';
import { ChannelRow } from '~/hypercast/components/ChannelRow';
import { PageHeader, TabLinks } from '~/hypercast/components/PageHeader';
import {
  EmptyView,
  ErrorView,
  LoadingView,
} from '~/hypercast/components/StateViews';
import { UserRow } from '~/hypercast/components/UserRow';
import { SearchBox } from '~/hypercast/layout/SearchBox';
import { paths, type SearchTab } from '~/hypercast/paths';
import { usePageTitle } from '~/hypercast/usePageTitle';
import {
  useCastSearch,
  useChannelSearch,
  useUserSearch,
} from '~/hypersnap/hooks';

const DEBOUNCE_MS = 300;

const CastResults: FC<{ query: string }> = memo(({ query }) => {
  const feed = useCastSearch(query);
  return (
    <CastFeed
      feed={feed}
      subject="Search results"
      emptyMessage={`No casts match “${query}”`}
      emptySubMessage="Search covers what this node has indexed."
    />
  );
});
CastResults.displayName = 'CastResults';

const UserResults: FC<{ query: string }> = memo(({ query }) => {
  const users = useUserSearch(query);
  if (users.isPending) {
    return <LoadingView label="Searching users" />;
  }
  if (users.isError) {
    return (
      <ErrorView
        error={users.error}
        subject="Search results"
        onRetry={() => void users.refetch()}
        isRetrying={users.isFetching}
      />
    );
  }
  if (users.data.length === 0) {
    return (
      <EmptyView
        message={`No usernames start with “${query}”`}
        subMessage="User search matches the beginning of a username."
      />
    );
  }
  return (
    <>
      {users.data.map((user) => (
        <UserRow key={user.fid} user={user} />
      ))}
    </>
  );
});
UserResults.displayName = 'UserResults';

const ChannelResults: FC<{ query: string }> = memo(({ query }) => {
  const channels = useChannelSearch(query);
  if (channels.isPending) {
    return <LoadingView label="Searching channels" />;
  }
  if (channels.isError) {
    return (
      <ErrorView
        error={channels.error}
        subject="Search results"
        onRetry={() => void channels.refetch()}
        isRetrying={channels.isFetching}
      />
    );
  }
  if (channels.data.length === 0) {
    return (
      <EmptyView
        message={`No channels start with “${query}”`}
        subMessage="Channel search matches the beginning of a channel name."
      />
    );
  }
  return (
    <>
      {channels.data.map((channel) => (
        <ChannelRow key={channel.id} channel={channel} />
      ))}
    </>
  );
});
ChannelResults.displayName = 'ChannelResults';

/**
 * Search with the query in the URL. Typing updates the URL after a short
 * pause, so results never lag behind a stale request and every search can
 * be linked to, reloaded and navigated back from.
 */
const SearchPage: FC<{ tab: SearchTab }> = memo(({ tab }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = (searchParams.get('q') ?? '').trim();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [typed, setTyped] = useState(query);

  usePageTitle(query === '' ? 'Search' : `${query} - Search`);

  useEffect(() => setTyped(query), [query]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onQueryChange = useCallback(
    (next: string) => {
      setTyped(next);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        navigate(paths.search(tab, next.trim()), { replace: true });
      }, DEBOUNCE_MS);
    },
    [navigate, tab],
  );

  const pendingQuery = typed.trim();

  return (
    <BorderedMainContent>
      <PageHeader
        visibleOnMobile
        hideCastButton
        footer={
          <TabLinks
            tabs={[
              {
                label: 'Casts',
                to: paths.search('casts', pendingQuery),
                isFocused: tab === 'casts',
              },
              {
                label: 'Users',
                to: paths.search('users', pendingQuery),
                isFocused: tab === 'users',
              },
              {
                label: 'Channels',
                to: paths.search('channels', pendingQuery),
                isFocused: tab === 'channels',
              },
            ]}
          />
        }
      >
        <div className="w-full pr-2">
          <SearchBox
            initialQuery={query}
            tab={tab}
            onQueryChange={onQueryChange}
            autoFocus={query === ''}
          />
        </div>
      </PageHeader>
      {query === '' ? (
        <EmptyView
          message="Search this Hypersnap node"
          subMessage="Find casts by their text, and users or channels by the start of their name."
        />
      ) : tab === 'casts' ? (
        <CastResults key={query} query={query} />
      ) : tab === 'users' ? (
        <UserResults query={query} />
      ) : (
        <ChannelResults query={query} />
      )}
    </BorderedMainContent>
  );
});

SearchPage.displayName = 'SearchPage';

export { SearchPage };
