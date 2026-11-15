import { HeartFillIcon, PersonAddIcon, SyncIcon } from '@primer/octicons-react';
import cn from 'classnames';
import { FC, memo, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Avatar } from '~/hypercast/components/Avatar';
import { CastCard } from '~/hypercast/components/CastCard';
import type { NotificationGroup } from '~/hypercast/notifications';
import { paths } from '~/hypercast/paths';
import type { CastContext } from '~/hypersnap/hooks';
import { handleOf } from '~/hypersnap/normalize';
import type { User } from '~/hypersnap/types';

const MAX_AVATARS = 8;
const ICON_SIZE = 24;

const stop = (event: React.SyntheticEvent) => event.stopPropagation();

const Graphic: FC<{ className: string; children: ReactNode }> = memo(
  ({ className, children }) => (
    <div className="flex w-[55.5px] shrink-0 flex-row justify-center pr-2">
      <div
        className={cn(
          'flex h-8 w-8 items-center justify-end rounded-full',
          className,
        )}
      >
        <div>{children}</div>
      </div>
    </div>
  ),
);
Graphic.displayName = 'Graphic';

const Actors: FC<{ actors: User[]; predicate: string }> = memo(
  ({ actors, predicate }) => {
    const [first, ...rest] = actors;
    return (
      <>
        <div className="mb-1 flex flex-row">
          {actors.slice(0, MAX_AVATARS).map((actor, index) => (
            <Avatar
              key={actor.fid}
              user={actor}
              size="sm"
              className={cn(index > 0 && 'ml-1')}
            />
          ))}
        </div>
        <div className="flex flex-1 flex-row flex-wrap items-center gap-1">
          <Link
            to={paths.profile(first)}
            title={first.displayName}
            className="relative font-semibold text-default hover:underline"
            onClick={stop}
          >
            {handleOf(first).replace('@', '')}
          </Link>
          {rest.length > 0 && (
            <>
              and{' '}
              <span className="font-semibold text-default">
                {rest.length} {rest.length === 1 ? 'other' : 'others'}
              </span>{' '}
            </>
          )}
          {predicate}
        </div>
      </>
    );
  },
);
Actors.displayName = 'Actors';

type NotificationRowProps = {
  group: NotificationGroup;
  /** True when the notifications belong to the signed-in account. */
  isOwn: boolean;
  /** "@name" of the account whose notifications these are. */
  subjectHandle: string;
  /** Quoted casts and reply parents for notifications shown as a cast. */
  context: CastContext;
};

const CAST_LABELS = {
  reply: 'Reply',
  mention: 'Mention',
  quote: 'Quote',
} as const;

const NotificationRow: FC<NotificationRowProps> = memo(
  ({ group, isOwn, subjectHandle, context }) => {
    const navigate = useNavigate();
    const rowClass =
      'relative flex flex-row items-start border-b px-4 pb-5 pt-4 border-default';

    if (group.kind === 'reaction') {
      const verb = group.reaction === 'like' ? 'liked' : 'recasted';
      return (
        <div
          className={cn(rowClass, 'cursor-pointer hover:bg-overlay-faint')}
          onClick={() => navigate(paths.cast(group.cast))}
        >
          {group.reaction === 'like' ? (
            <Graphic className="text-danger">
              <HeartFillIcon size={ICON_SIZE} />
            </Graphic>
          ) : (
            <Graphic className="text-success">
              <SyncIcon size={ICON_SIZE} />
            </Graphic>
          )}
          <div className="w-full min-w-0">
            <Actors
              actors={group.actors}
              predicate={
                isOwn
                  ? `${verb} your cast`
                  : `${verb} a cast by ${subjectHandle}`
              }
            />
            <div className="line-clamp-2 pt-1 text-sm text-muted [overflow-wrap:anywhere]">
              {group.cast.text}
            </div>
          </div>
        </div>
      );
    }

    if (group.kind === 'follow') {
      return (
        <div className={rowClass}>
          <Graphic className="text-informative">
            <PersonAddIcon size={ICON_SIZE} className="mb-px" />
          </Graphic>
          <div className="w-full min-w-0">
            <Actors
              actors={group.actors}
              predicate={isOwn ? 'followed you' : `followed ${subjectHandle}`}
            />
          </div>
        </div>
      );
    }

    if (group.kind === 'cast') {
      return (
        <div className="border-b border-default">
          <div className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-faint">
            {CAST_LABELS[group.label]}
          </div>
          <CastCard
            cast={group.cast}
            context={context}
            isFirstInList
            showReplyingTo={false}
          />
        </div>
      );
    }

    return (
      <div className={rowClass}>
        <Graphic className="text-secondary">
          <span aria-hidden="true">•</span>
        </Graphic>
        <div className="w-full min-w-0">
          <Actors
            actors={[group.actor]}
            predicate="interacted with this account"
          />
        </div>
      </div>
    );
  },
);
NotificationRow.displayName = 'NotificationRow';

export { NotificationRow };
