import { FC, memo } from 'react';
import { useParams } from 'react-router-dom';

import { BorderedMainContent } from '~/components/BorderedMainContent';
import { CastFeed } from '~/hypercast/components/CastFeed';
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
import { REACTION_TAB_SEGMENT, type ReactionTab } from '~/hypercast/paths';
import { usePageTitle } from '~/hypercast/usePageTitle';
import { MAX_PAGE_SIZE } from '~/hypersnap/api';
import {
  useCastReactions,
  useQuotes,
  useResolvedCastHash,
} from '~/hypersnap/hooks';
import type { CastHash } from '~/hypersnap/types';

const Reactors: FC<{ hash: CastHash; kind: 'like' | 'recast' }> = memo(
  ({ hash, kind }) => {
    const reactions = useCastReactions(hash, kind);
    const noun = kind === 'like' ? 'likes' : 'recasts';

    if (reactions.isPending) {
      return <LoadingView label={`Loading ${noun}`} />;
    }
    if (reactions.isError) {
      return (
        <ErrorView
          error={reactions.error}
          subject="Cast"
          onRetry={() => void reactions.refetch()}
          isRetrying={reactions.isFetching}
        />
      );
    }
    if (reactions.data.length === 0) {
      return <EmptyView message={`No ${noun} yet`} />;
    }
    return (
      <>
        {reactions.data.map((reaction) => (
          <UserRow key={reaction.user.fid} user={reaction.user} />
        ))}
        {reactions.data.length >= MAX_PAGE_SIZE && (
          <div className="px-4 py-3 text-sm text-faint">
            Showing the first {MAX_PAGE_SIZE}. The node does not page this list.
          </div>
        )}
      </>
    );
  },
);
Reactors.displayName = 'Reactors';

const Quotes: FC<{ hash: CastHash }> = memo(({ hash }) => {
  const feed = useQuotes(hash);
  return <CastFeed feed={feed} subject="Quotes" emptyMessage="No quotes yet" />;
});
Quotes.displayName = 'Quotes';

const TITLES: Record<ReactionTab, string> = {
  likes: 'Likes',
  recasts: 'Recasts',
  quotes: 'Quotes',
};

const CastReactionsPage: FC<{ tab: ReactionTab }> = memo(({ tab }) => {
  usePageTitle(TITLES[tab]);
  const params = useParams();
  const hashParam = params.castHash ?? params.castHashPrefix;
  const resolved = useResolvedCastHash(params.username, hashParam);

  // Tab links keep whichever URL form the page was opened with.
  const base = params.username
    ? `/${encodeURIComponent(params.username)}/${hashParam}`
    : `/~/conversations/${hashParam}`;

  return (
    <BorderedMainContent>
      <PageHeader
        showBack
        visibleOnMobile
        hideCastButton
        footer={
          <TabLinks
            tabs={(Object.keys(TITLES) as ReactionTab[]).map((key) => ({
              label: TITLES[key],
              to: `${base}/${REACTION_TAB_SEGMENT[key]}`,
              isFocused: key === tab,
            }))}
          />
        }
      >
        <PageTitle>{TITLES[tab]}</PageTitle>
        <span className="text-base font-semibold sm:hidden">{TITLES[tab]}</span>
      </PageHeader>
      {resolved.hash === null ? (
        resolved.isPending ? (
          <LoadingView label="Finding cast" />
        ) : (
          <ErrorView error={resolved.error} subject="Cast" />
        )
      ) : tab === 'quotes' ? (
        <Quotes hash={resolved.hash} />
      ) : (
        <Reactors
          hash={resolved.hash}
          kind={tab === 'likes' ? 'like' : 'recast'}
        />
      )}
    </BorderedMainContent>
  );
});

CastReactionsPage.displayName = 'CastReactionsPage';

export { CastReactionsPage };
