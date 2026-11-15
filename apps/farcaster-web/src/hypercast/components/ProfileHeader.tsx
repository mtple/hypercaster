import { EyeIcon } from 'lucide-react';
import { FC, memo, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { DefaultButton } from '~/components/forms/buttons/DefaultButton';
import { ImageLightboxModal } from '~/components/modals/ImageLightboxModal';
import { Avatar } from '~/hypercast/components/Avatar';
import { BackButton } from '~/hypercast/components/BackButton';
import { RichText } from '~/hypercast/components/RichText';
import { FollowButton } from '~/hypercast/components/UserRow';
import { useViewAs } from '~/hypercast/components/ViewAsDialog';
import { formatCount } from '~/hypercast/format';
import { paths } from '~/hypercast/paths';
import { handleOf } from '~/hypersnap/normalize';
import { subjectFidOf, useSession } from '~/hypersnap/session';
import type { User } from '~/hypersnap/types';

const FollowCount: FC<{ count: number; label: string }> = memo(
  ({ count, label }) => (
    <>
      <span
        className="mr-1 font-semibold text-default"
        title={count.toLocaleString()}
      >
        {formatCount(count)}
      </span>
      <span className="text-muted">{label}</span>
    </>
  ),
);
FollowCount.displayName = 'FollowCount';

function useIsScrolled(threshold: number): boolean {
  const [isScrolled, setIsScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);
  return isScrolled;
}

/**
 * Profile top bar, band, avatar and details, after the upstream profile.
 * The band is shorter than upstream's banner because accounts on Hypersnap
 * have no banner image to fill it.
 */
const ProfileHeader: FC<{ user: User }> = memo(({ user }) => {
  const session = useSession();
  const { viewAs } = useViewAs();
  const isScrolled = useIsScrolled(140);
  const [showAvatar, setShowAvatar] = useState(false);
  const isSubject = subjectFidOf(session) === user.fid;

  return (
    <>
      <div className="sticky top-0 z-10">
        <div className="flex h-[52px] w-full flex-row items-center justify-between border-b px-4 bg-app border-default">
          <div className="flex h-[34px] min-w-0 flex-row items-center space-x-3">
            <BackButton className="!mr-0" />
            <div
              className={
                isScrolled
                  ? 'max-w-[300px] truncate text-base font-semibold opacity-100 transition-opacity text-default'
                  : 'max-w-[300px] truncate text-base font-semibold opacity-0 transition-opacity text-default'
              }
              aria-hidden={!isScrolled}
            >
              {handleOf(user)}
            </div>
          </div>
        </div>
      </div>
      <div className="relative h-[120px] overflow-hidden bg-light-purple" />
      <div className="relative flex w-full flex-col">
        <div className="z-[1] flex w-full flex-col">
          <div className="mt-[-48px] flex flex-row items-end justify-between px-4 pr-4">
            <span className="relative rounded-full border-[3px] border-app">
              <button
                type="button"
                className="block cursor-pointer rounded-full border-0 bg-transparent p-0"
                aria-label="Show profile picture"
                disabled={user.pfpUrl === null}
                onClick={() => setShowAvatar(true)}
              >
                <Avatar user={user} size="xl2" disabled priority />
              </button>
            </span>
            <div className="flex flex-row items-center gap-2 pb-1">
              {session.mode !== 'signedIn' && !isSubject && (
                <DefaultButton
                  variant="secondary"
                  title="See this account’s public following feed and notifications. This is not a sign-in."
                  onClick={() => viewAs(user)}
                >
                  <span className="flex flex-row items-center gap-1.5">
                    <EyeIcon size={14} aria-hidden="true" />
                    View as
                  </span>
                </DefaultButton>
              )}
              {session.mode === 'viewing' && isSubject && (
                <span className="rounded-full border px-3 py-1.5 text-sm text-muted border-default">
                  Viewing as
                </span>
              )}
              <FollowButton user={user} />
            </div>
          </div>
          <div className="flex flex-row items-start p-4 pt-2">
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex min-w-0 flex-row items-center space-x-1">
                <h1 className="truncate text-lg font-bold leading-5 text-default">
                  {user.displayName}
                </h1>
              </div>
              <div className="flex flex-row flex-wrap items-baseline gap-y-1">
                <div className="mr-1 text-base text-muted">
                  {handleOf(user)}
                </div>
                {user.viewerContext?.followedBy && (
                  <div className="mr-1 rounded border px-2 py-0.5 text-xs text-muted border-default">
                    Follows you
                  </div>
                )}
                {user.isNative && (
                  <div
                    className="rounded border px-2 py-0.5 text-xs text-muted border-default"
                    title="Registered on Hypersnap itself. This account does not exist on Snapchain."
                  >
                    Hypersnap-native
                  </div>
                )}
              </div>
              {user.bio !== '' && (
                <div className="mt-1 max-w-[480px] whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  <RichText text={user.bio} />
                </div>
              )}
              <div className="mt-2 flex flex-row gap-2">
                <Link
                  to={paths.followingList(user)}
                  title={`Users followed by ${user.displayName}`}
                  className="hover:underline"
                >
                  <FollowCount count={user.followingCount} label="Following" />
                </Link>
                <Link
                  to={paths.followers(user)}
                  title={`Users following ${user.displayName}`}
                  className="hover:underline"
                >
                  <FollowCount count={user.followerCount} label="Followers" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
      {showAvatar && user.pfpUrl !== null && (
        <ImageLightboxModal
          imageUrls={[user.pfpUrl]}
          initialIndex={0}
          onClose={() => setShowAvatar(false)}
          title="User profile picture"
        />
      )}
    </>
  );
});

ProfileHeader.displayName = 'ProfileHeader';

export { ProfileHeader };
