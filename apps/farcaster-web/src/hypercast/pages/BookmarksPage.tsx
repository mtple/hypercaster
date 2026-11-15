import { FC, memo, useMemo } from 'react';

import { BorderedMainContent } from '~/components/BorderedMainContent';
import { DefaultButton } from '~/components/forms/buttons/DefaultButton';
import { CastCard } from '~/hypercast/components/CastCard';
import {
  EmptyView,
  ErrorView,
  LoadingView,
} from '~/hypercast/components/StateViews';
import { usePageTitle } from '~/hypercast/usePageTitle';
import { clearBookmarks, useBookmarks } from '~/hypersnap/bookmarks';
import { config } from '~/hypersnap/config';
import { useCastsByHash } from '~/hypersnap/hooks';

const BookmarksPage: FC = memo(() => {
  usePageTitle('Bookmarks');
  const bookmarks = useBookmarks();
  const hashes = useMemo(
    () => bookmarks.map((bookmark) => bookmark.hash),
    [bookmarks],
  );
  const casts = useCastsByHash(hashes);

  return (
    <BorderedMainContent>
      <div className="flex w-full items-center justify-between px-4 pb-2 pt-5">
        <h1 className="text-lg font-semibold">Bookmarks</h1>
        {hashes.length > 0 && (
          <DefaultButton
            variant="secondary"
            size="sm"
            onClick={() => {
              if (
                window.confirm('Remove every bookmark saved on this device?')
              ) {
                clearBookmarks();
              }
            }}
          >
            Clear all
          </DefaultButton>
        )}
      </div>
      <div className="border-b px-4 pb-3 text-sm text-muted border-default">
        Saved on this device only. Bookmarks are not sent to the network and
        will not appear in other browsers or apps.
      </div>
      {hashes.length === 0 ? (
        <EmptyView
          message="You’ll see your bookmarked casts here"
          subMessage="Use the bookmark icon on any cast to save it."
        />
      ) : casts.isPending ? (
        <LoadingView label="Loading bookmarks" />
      ) : casts.isError ? (
        <ErrorView
          error={casts.error}
          subject="Bookmarks"
          onRetry={() => void casts.refetch()}
          isRetrying={casts.isFetching}
        />
      ) : (
        <>
          {casts.data.casts.map((cast, index) => (
            <CastCard
              key={cast.hash}
              cast={cast}
              context={casts.data.context}
              isFirstInList={index === 0}
              isLastInList={index === casts.data.casts.length - 1}
            />
          ))}
          {casts.data.missing > 0 && (
            <div className="px-4 py-3 text-sm text-faint">
              {casts.data.missing} bookmarked{' '}
              {casts.data.missing === 1 ? 'cast is' : 'casts are'} no longer
              available on {config.nodeLabel}.
            </div>
          )}
        </>
      )}
    </BorderedMainContent>
  );
});

BookmarksPage.displayName = 'BookmarksPage';

export { BookmarksPage };
