import cn from 'classnames';
import { FC, memo, useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Avatar, AVATAR_SIZES } from '~/hypercast/components/Avatar';
import { CastActions } from '~/hypercast/components/CastActions';
import { Embeds } from '~/hypercast/components/Embeds';
import { RichText } from '~/hypercast/components/RichText';
import {
  Threadline,
  type ThreadPosition,
} from '~/hypercast/components/Threadline';
import { exactTime, timeAgo } from '~/hypercast/format';
import { paths } from '~/hypercast/paths';
import { useWrites } from '~/hypercast/write/WriteContext';
import type { CastContext } from '~/hypersnap/hooks';
import { handleOf } from '~/hypersnap/normalize';
import type { Cast } from '~/hypersnap/types';

const stop = (event: React.SyntheticEvent) => event.stopPropagation();

// https://gist.ake.cx/redoPop/184082fcfa28bb14380097457a666f2f
function useClampCheck(): [boolean, React.RefCallback<HTMLElement>] {
  const [clamped, setClamped] = useState(false);
  const ref: React.RefCallback<HTMLElement> = (element) =>
    setClamped(Boolean(element && element.scrollHeight > element.clientHeight));
  return [clamped, ref];
}

const ChannelTag: FC<{ channelId: string }> = memo(({ channelId }) => (
  <Link
    to={paths.channel(channelId)}
    title={`/${channelId}`}
    className="cursor-pointer"
    onClick={stop}
    onMouseDown={stop}
  >
    <div className="flex min-w-0 shrink-0 cursor-pointer flex-row items-center space-x-1 rounded-full px-[6px] py-[3px] bg-surface-secondary">
      <div className="text-ellipsis text-nowrap leading-[18px] text-[#546473] dark:text-[#9FA3AF]">
        {channelId}
      </div>
    </div>
  </Link>
));
ChannelTag.displayName = 'ChannelTag';

type CastAuthorLineProps = {
  cast: Cast;
  showChannel?: boolean;
};

const CastAuthorLine: FC<CastAuthorLineProps> = memo(
  ({ cast, showChannel = false }) => (
    <div className="flex w-full min-w-0 flex-row items-center gap-1">
      <Link
        to={paths.profile(cast.author)}
        title={cast.author.displayName}
        className="relative truncate font-semibold !text-inherit hover:underline"
        onClick={stop}
        onMouseDown={stop}
      >
        {handleOf(cast.author).replace('@', '')}
      </Link>
      {showChannel && cast.channelId && (
        <>
          <div className="text-muted">in</div>
          <ChannelTag channelId={cast.channelId} />
        </>
      )}
      <Link
        to={paths.cast(cast)}
        title={exactTime(cast.timestampMs)}
        className="shrink-0"
        onClick={stop}
        onMouseDown={stop}
      >
        <div className="cursor-pointer text-base text-faint hover:underline">
          {timeAgo(cast.timestampMs)}
        </div>
      </Link>
    </div>
  ),
);
CastAuthorLine.displayName = 'CastAuthorLine';

type CastCardProps = {
  cast: Cast;
  context: CastContext;
  threadPosition?: ThreadPosition;
  isFirstInList?: boolean;
  isLastInList?: boolean;
  /** Show the channel next to the author. Off inside a channel's own feed. */
  showChannel?: boolean;
  /** Show "Replying to" above the text. Off when the parent is right above. */
  showReplyingTo?: boolean;
  truncate?: boolean;
};

/**
 * A cast in a list. Structure and class names follow the upstream feed
 * card; the data comes from Hypersnap view models.
 */
const CastCard: FC<CastCardProps> = memo(
  ({
    cast,
    context,
    threadPosition = 'none',
    isFirstInList = false,
    isLastInList = false,
    showChannel = true,
    showReplyingTo = true,
    truncate = true,
  }) => {
    const navigate = useNavigate();
    const writes = useWrites();
    const [isClamped, clampRef] = useClampCheck();
    const [showFull, setShowFull] = useState(false);

    const continuesFromAbove =
      threadPosition === 'middle' || threadPosition === 'end';
    const shouldShowTopBorder = !(isFirstInList || continuesFromAbove);
    const parentAuthor =
      cast.parentAuthorFid !== null
        ? context.people[cast.parentAuthorFid]
        : undefined;

    const open = useCallback(
      (event: React.MouseEvent) => {
        // Let people select text without being navigated away.
        if (window.getSelection()?.toString()) {
          return;
        }
        const href = paths.cast(cast);
        if (event.metaKey || event.ctrlKey) {
          window.open(href, '_blank', 'noopener');
          return;
        }
        navigate(href);
      },
      [cast, navigate],
    );

    const onShowMore = useCallback((event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setShowFull(true);
    }, []);

    if (writes.isDeleted(cast)) {
      return (
        <div className="border-t px-4 py-3 text-sm !border-surface-secondary text-faint">
          This cast was deleted.
        </div>
      );
    }

    return (
      <article
        className="relative"
        id={`cast:${cast.hash}`}
        aria-label={`Cast by ${handleOf(cast.author)}`}
      >
        <div
          className={cn(
            'relative cursor-pointer py-2 hover:bg-overlay-faint',
            shouldShowTopBorder && 'border-t !border-surface-secondary',
            isLastInList && 'border-b !border-surface-secondary',
          )}
          onClick={open}
          onAuxClick={(event) => {
            if (event.button === 1) {
              window.open(paths.cast(cast), '_blank', 'noopener');
            }
          }}
        >
          <div className="absolute ml-4 mr-2">
            <Avatar user={cast.author} className="relative z-[2]" size="md" />
          </div>
          <Threadline threadPosition={threadPosition} />
          <div className="relative flex flex-col">
            <div className="relative flex">
              <div className="relative w-full min-w-0">
                <div className="mr-4 flex flex-row justify-between gap-2">
                  <div className="mb-[2px] flex min-w-0 shrink flex-row items-center">
                    <div
                      className="shrink-0"
                      style={{
                        width: AVATAR_SIZES.md + 24,
                        minWidth: AVATAR_SIZES.md + 24,
                      }}
                    />
                    <CastAuthorLine cast={cast} showChannel={showChannel} />
                  </div>
                </div>
                {showReplyingTo &&
                  cast.parentHash !== null &&
                  !continuesFromAbove && (
                    <div className="flex flex-row space-x-1 pb-1 text-xs text-muted">
                      <div
                        className="shrink-0"
                        style={{
                          width: AVATAR_SIZES.md + 20,
                          minWidth: AVATAR_SIZES.md + 20,
                        }}
                      />
                      <div>Replying to</div>
                      {parentAuthor ? (
                        <Link
                          to={paths.profile(parentAuthor)}
                          title={parentAuthor.displayName}
                          className="relative hover:underline"
                          onClick={stop}
                          onMouseDown={stop}
                        >
                          {handleOf(parentAuthor)}
                        </Link>
                      ) : (
                        <Link
                          to={paths.castByHash(cast.parentHash)}
                          className="relative hover:underline"
                          onClick={stop}
                          onMouseDown={stop}
                        >
                          a cast
                        </Link>
                      )}
                    </div>
                  )}
                {cast.text !== '' && (
                  <div className="flex flex-row pl-[72px] pr-4">
                    <div className="flex flex-col whitespace-pre-wrap break-words text-base leading-5 tracking-normal">
                      <div
                        className={cn(
                          truncate && !showFull && 'line-clamp-feed',
                          '[overflow-wrap:anywhere]',
                        )}
                        ref={clampRef}
                      >
                        <RichText text={cast.text} mentions={cast.mentions} />
                      </div>
                      {isClamped && !showFull && (
                        <button
                          type="button"
                          className="inline cursor-pointer border-0 bg-transparent p-0 text-left text-link hover:underline"
                          onClick={onShowMore}
                          onMouseDown={stop}
                        >
                          Show more
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <Embeds cast={cast} context={context} variant="feed" />
                <div className="mr-4 mt-3 flex flex-row items-center">
                  <div
                    style={{
                      width: AVATAR_SIZES.md + 16,
                      minWidth: AVATAR_SIZES.md + 16,
                    }}
                  />
                  <CastActions cast={cast} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </article>
    );
  },
);

CastCard.displayName = 'CastCard';

export { CastAuthorLine, CastCard, ChannelTag };
