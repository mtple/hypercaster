import { FC, memo, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';

import { BorderedMainContent } from '~/components/BorderedMainContent';
import { CastCard } from '~/hypercast/components/CastCard';
import { FocusedCast } from '~/hypercast/components/FocusedCast';
import { PageHeader, PageTitle } from '~/hypercast/components/PageHeader';
import {
  EmptyView,
  ErrorView,
  LoadingView,
} from '~/hypercast/components/StateViews';
import { paths } from '~/hypercast/paths';
import { threadRows } from '~/hypercast/thread';
import { usePageTitle } from '~/hypercast/usePageTitle';
import { config } from '~/hypersnap/config';
import { useConversation, useResolvedCastHash } from '~/hypersnap/hooks';
import { handleOf } from '~/hypersnap/normalize';
import type { CastHash } from '~/hypersnap/types';

const Conversation: FC<{ hash: CastHash }> = memo(({ hash }) => {
  const conversation = useConversation(hash);
  const data = conversation.data;

  usePageTitle(
    data
      ? `${handleOf(data.root.cast.author)}: ${data.root.cast.text.slice(0, 60) || 'cast'}`
      : 'Conversation',
  );

  const replies = useMemo(
    () => (data ? data.root.replies.map((reply) => threadRows(reply)) : []),
    [data],
  );

  if (conversation.isPending) {
    return <LoadingView label="Loading conversation" />;
  }
  if (conversation.isError || !data) {
    return (
      <ErrorView
        error={conversation.error}
        subject="Cast"
        onRetry={() => void conversation.refetch()}
        isRetrying={conversation.isFetching}
      />
    );
  }

  const { ancestors, ancestorsIncomplete, root, context } = data;
  const focused = root.cast;
  const shownReplies = root.replies.length;
  const unshownReplies = Math.max(0, focused.repliesCount - shownReplies);

  return (
    <>
      {ancestorsIncomplete && (
        <div className="border-b px-4 py-3 text-sm border-default text-faint">
          {ancestors.length === 0
            ? `This is a reply, but the cast it replies to is not available on ${config.nodeLabel}.`
            : 'Earlier casts in this thread are not shown.'}
        </div>
      )}
      {ancestors.map((cast, index) => (
        <CastCard
          key={cast.hash}
          cast={cast}
          context={context}
          threadPosition={index === 0 ? 'start' : 'middle'}
          isFirstInList={index === 0}
          showReplyingTo={index === 0}
        />
      ))}
      <FocusedCast
        cast={focused}
        context={context}
        hasParentAbove={ancestors.length > 0}
      />
      <div className="border-t border-surface-secondary">
        {shownReplies === 0 ? (
          <EmptyView
            message={
              focused.repliesCount > 0
                ? 'Replies are not available'
                : 'No replies yet'
            }
            subMessage={
              focused.repliesCount > 0
                ? `${config.nodeLabel} reports replies but returned none.`
                : undefined
            }
          />
        ) : (
          replies.map((rows, replyIndex) => (
            <div key={rows[0].cast.hash}>
              {rows.map((row, rowIndex) => (
                <div key={row.cast.hash}>
                  <CastCard
                    cast={row.cast}
                    context={context}
                    threadPosition={row.threadPosition}
                    isFirstInList={replyIndex === 0 && rowIndex === 0}
                    showReplyingTo={false}
                    truncate={false}
                  />
                  {row.hiddenReplies > 0 && (
                    <Link
                      to={paths.cast(row.cast)}
                      className="block pb-3 pl-[72px] pr-4 text-sm text-link hover:underline"
                    >
                      Show {row.hiddenReplies} more{' '}
                      {row.hiddenReplies === 1 ? 'reply' : 'replies'}
                    </Link>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
        {shownReplies > 0 && unshownReplies > 0 && (
          <div className="border-t px-4 py-3 text-sm border-surface-secondary text-faint">
            {unshownReplies} more{' '}
            {unshownReplies === 1 ? 'reply is' : 'replies are'} not shown.
          </div>
        )}
      </div>
    </>
  );
});
Conversation.displayName = 'Conversation';

/**
 * A cast and its thread. Handles both "/:username/:hash" and
 * "/~/conversations/:hash"; a short hash is resolved through the author.
 */
const ConversationPage: FC = memo(() => {
  const params = useParams();
  const hashParam = params.castHash ?? params.castHashPrefix;
  const resolved = useResolvedCastHash(params.username, hashParam);

  return (
    <BorderedMainContent>
      <PageHeader showBack visibleOnMobile hideCastButton>
        <PageTitle>Conversation</PageTitle>
        <span className="text-base font-semibold sm:hidden">Conversation</span>
      </PageHeader>
      {resolved.hash !== null ? (
        <Conversation key={resolved.hash} hash={resolved.hash} />
      ) : resolved.isPending ? (
        <LoadingView label="Finding cast" />
      ) : (
        <ErrorView
          error={resolved.error}
          subject="Cast"
          onRetry={() => void resolved.refetch()}
        />
      )}
    </BorderedMainContent>
  );
});

ConversationPage.displayName = 'ConversationPage';

export { ConversationPage };
