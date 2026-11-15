import { FC, memo } from 'react';
import { Link } from 'react-router-dom';

import { Avatar } from '~/hypercast/components/Avatar';
import { CastActions } from '~/hypercast/components/CastActions';
import { ChannelTag } from '~/hypercast/components/CastCard';
import { Embeds } from '~/hypercast/components/Embeds';
import { RichText } from '~/hypercast/components/RichText';
import { Threadline } from '~/hypercast/components/Threadline';
import { exactTime, formatCount, pluralize, timeAgo } from '~/hypercast/format';
import { paths } from '~/hypercast/paths';
import { useWrites } from '~/hypercast/write/WriteContext';
import type { CastContext } from '~/hypersnap/hooks';
import { handleOf } from '~/hypersnap/normalize';
import type { Cast } from '~/hypersnap/types';

type DetailProps = {
  count: number;
  singular: string;
  plural: string;
  to: string;
};

const Detail: FC<DetailProps> = memo(({ count, singular, plural, to }) => (
  <Link
    to={to}
    title={`View ${plural}`}
    className="text-inherit hover:underline"
  >
    <span
      className="mr-1 text-sm font-semibold text-secondary"
      title={count.toLocaleString()}
    >
      {formatCount(count)}
    </span>
    <span className="text-sm text-secondary">
      {pluralize(count, singular, plural)}
    </span>
  </Link>
));
Detail.displayName = 'Detail';

type FocusedCastProps = {
  cast: Cast;
  context: CastContext;
  /** The cast directly above is this one's parent. */
  hasParentAbove: boolean;
};

/** The cast a conversation page is about, in the upstream focused layout. */
const FocusedCast: FC<FocusedCastProps> = memo(
  ({ cast, context, hasParentAbove }) => {
    const writes = useWrites();
    const engagement = writes.engagementOf(cast);

    if (writes.isDeleted(cast)) {
      return (
        <div className="p-4 text-sm text-faint">This cast was deleted.</div>
      );
    }

    return (
      <article
        className="relative"
        id={`cast:${cast.hash}`}
        aria-label={`Cast by ${handleOf(cast.author)}`}
      >
        <div className="relative p-4 pt-2">
          <Threadline threadPosition={hasParentAbove ? 'end' : 'none'} />
          <div className="flex w-full items-center">
            <div className="flex w-full min-w-0 pb-2">
              <Avatar user={cast.author} className="relative z-[2]" priority />
              <div className="flex min-w-0 flex-col items-start justify-center gap-0.5 pl-3">
                <div className="flex max-w-full items-center justify-center gap-1">
                  <Link
                    to={paths.profile(cast.author)}
                    title={cast.author.displayName}
                    className="truncate font-semibold text-default hover:underline"
                  >
                    {handleOf(cast.author).replace('@', '')}
                  </Link>
                  <div
                    className="shrink-0 cursor-default text-base text-faint"
                    title={exactTime(cast.timestampMs)}
                  >
                    {timeAgo(cast.timestampMs)}
                  </div>
                </div>
                {cast.channelId && <ChannelTag channelId={cast.channelId} />}
              </div>
            </div>
          </div>
          {cast.text !== '' && (
            <div className="flex flex-col whitespace-pre-wrap break-words text-lg leading-6 tracking-normal [overflow-wrap:anywhere]">
              <div>
                <RichText text={cast.text} mentions={cast.mentions} />
              </div>
            </div>
          )}
        </div>
        <Embeds cast={cast} context={context} variant="focused" />
        <div className="my-2 px-2">
          <CastActions cast={cast} isFocused />
        </div>
        {(cast.repliesCount > 0 ||
          engagement.recastsCount > 0 ||
          engagement.likesCount > 0) && (
          <div className="mb-3 flex flex-row flex-wrap items-center gap-x-4 gap-y-1 px-4">
            {cast.repliesCount > 0 && (
              <div>
                <span className="mr-1 text-sm font-semibold text-secondary">
                  {formatCount(cast.repliesCount)}
                </span>
                <span className="text-sm text-secondary">
                  {pluralize(cast.repliesCount, 'reply', 'replies')}
                </span>
              </div>
            )}
            {engagement.recastsCount > 0 && (
              <Detail
                count={engagement.recastsCount}
                singular="recast"
                plural="recasts"
                to={paths.castReactions(cast, 'recasts')}
              />
            )}
            <Link
              to={paths.castReactions(cast, 'quotes')}
              title="View quotes"
              className="text-sm text-secondary hover:underline"
            >
              Quotes
            </Link>
            {engagement.likesCount > 0 && (
              <Detail
                count={engagement.likesCount}
                singular="like"
                plural="likes"
                to={paths.castReactions(cast, 'likes')}
              />
            )}
          </div>
        )}
      </article>
    );
  },
);

FocusedCast.displayName = 'FocusedCast';

export { FocusedCast };
