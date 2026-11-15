import { FC, memo, ReactElement, useCallback } from 'react';

import { DefaultButton } from '~/components/forms/buttons/DefaultButton';
import { FlatList } from '~/components/lists/FlatList';
import { CastCard } from '~/hypercast/components/CastCard';
import {
  EmptyView,
  ErrorView,
  LoadingView,
} from '~/hypercast/components/StateViews';
import type { CastContext, useCastFeed } from '~/hypersnap/hooks';
import type { Cast } from '~/hypersnap/types';

type CastFeedProps = {
  feed: ReturnType<typeof useCastFeed>;
  /** What this list is, for error wording: "Feed", "Search results". */
  subject?: string;
  emptyMessage: string;
  emptySubMessage?: string;
  showChannel?: boolean;
  showReplyingTo?: boolean;
};

const keyOf = (cast: Cast) => cast.hash;

type Extra = {
  context: CastContext;
  total: number;
  showChannel: boolean;
  showReplyingTo: boolean;
};

const renderCast = ({
  item,
  index,
  extra,
}: {
  item: Cast;
  index: number;
  extra?: Extra;
}): ReactElement => (
  <CastCard
    cast={item}
    context={extra!.context}
    isFirstInList={index === 0}
    isLastInList={index === extra!.total - 1}
    showChannel={extra!.showChannel}
    showReplyingTo={extra!.showReplyingTo}
  />
);

/**
 * An infinitely scrolling list of casts with every state accounted for:
 * first load, failure, empty, more loading, more failing.
 */
const CastFeed: FC<CastFeedProps> = memo(
  ({
    feed,
    subject = 'Feed',
    emptyMessage,
    emptySubMessage,
    showChannel = true,
    showReplyingTo = true,
  }) => {
    const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;

    const onEndReached = useCallback(() => {
      if (hasNextPage && !isFetchingNextPage) {
        void fetchNextPage();
      }
    }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

    if (feed.isPending) {
      return <LoadingView label={`Loading ${subject.toLowerCase()}`} />;
    }

    // A failure with nothing to show is an error, never an empty list.
    if (feed.isError && feed.casts.length === 0) {
      return (
        <ErrorView
          error={feed.error}
          subject={subject}
          onRetry={() => void feed.refetch()}
          isRetrying={feed.isFetching}
        />
      );
    }

    return (
      <>
        <FlatList
          data={feed.casts}
          extraProps={{
            context: feed.context,
            total: feed.casts.length,
            showChannel,
            showReplyingTo,
          }}
          emptyView={
            <EmptyView message={emptyMessage} subMessage={emptySubMessage} />
          }
          renderItem={renderCast}
          keyExtractor={keyOf}
          onEndReached={onEndReached}
          isFetchingNextPage={isFetchingNextPage}
        />
        {feed.isFetchNextPageError && (
          <div
            role="alert"
            className="flex flex-col items-center gap-2 px-4 py-6 text-sm text-muted"
          >
            <div>Couldn’t load more.</div>
            <DefaultButton
              variant="secondary"
              size="sm"
              onClick={() => void fetchNextPage()}
            >
              Try again
            </DefaultButton>
          </div>
        )}
      </>
    );
  },
);

CastFeed.displayName = 'CastFeed';

export { CastFeed };
