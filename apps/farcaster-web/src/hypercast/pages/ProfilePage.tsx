import { FC, memo } from 'react';
import { useParams } from 'react-router-dom';

import { BorderedMainContent } from '~/components/BorderedMainContent';
import { CastCard } from '~/hypercast/components/CastCard';
import { CastFeed } from '~/hypercast/components/CastFeed';
import {
  PageHeader,
  PageTitle,
  TabLinks,
} from '~/hypercast/components/PageHeader';
import { ProfileHeader } from '~/hypercast/components/ProfileHeader';
import {
  EmptyView,
  ErrorView,
  LoadingView,
} from '~/hypercast/components/StateViews';
import { UserList } from '~/hypercast/components/UserRow';
import { paths, type ProfileTab } from '~/hypercast/paths';
import { usePageTitle } from '~/hypercast/usePageTitle';
import {
  useFollowers,
  useFollowingList,
  useProfile,
  useUserCasts,
  useUserLikes,
} from '~/hypersnap/hooks';
import { handleOf } from '~/hypersnap/normalize';
import type { User } from '~/hypersnap/types';

const CastsTab: FC<{ user: User; tab: 'casts' | 'replies' }> = memo(
  ({ user, tab }) => {
    const feed = useUserCasts(user.fid, tab);
    return (
      <CastFeed
        feed={feed}
        subject={tab === 'casts' ? 'Casts' : 'Replies'}
        emptyMessage={tab === 'casts' ? 'No casts yet' : 'No replies yet'}
      />
    );
  },
);
CastsTab.displayName = 'CastsTab';

const LikesTab: FC<{ user: User }> = memo(({ user }) => {
  const likes = useUserLikes(user.fid);
  if (likes.isPending) {
    return <LoadingView label="Loading likes" />;
  }
  if (likes.isError) {
    return (
      <ErrorView
        error={likes.error}
        subject="Likes"
        onRetry={() => void likes.refetch()}
        isRetrying={likes.isFetching}
      />
    );
  }
  if (likes.data.casts.length === 0) {
    return <EmptyView message="No likes to show" />;
  }
  return (
    <>
      {likes.data.casts.map((cast, index) => (
        <CastCard
          key={cast.hash}
          cast={cast}
          context={likes.data.context}
          isFirstInList={index === 0}
          isLastInList={index === likes.data.casts.length - 1}
        />
      ))}
      <div className="px-4 py-3 text-sm text-faint">
        Showing recent likes only. The node does not page this list.
      </div>
    </>
  );
});
LikesTab.displayName = 'LikesTab';

function useRouteProfile() {
  const params = useParams();
  return useProfile({ fid: params.fid, username: params.username });
}

const ProfileProblem: FC<{ profile: ReturnType<typeof useProfile> }> = memo(
  ({ profile }) => (
    <>
      <PageHeader showBack visibleOnMobile hideCastButton>
        <PageTitle>Profile</PageTitle>
        <span className="text-base font-semibold sm:hidden">Profile</span>
      </PageHeader>
      {profile.isPending ? (
        <LoadingView label="Loading profile" />
      ) : (
        <ErrorView
          error={profile.error}
          subject="Account"
          onRetry={() => void profile.refetch()}
          isRetrying={profile.isFetching}
        />
      )}
    </>
  ),
);
ProfileProblem.displayName = 'ProfileProblem';

const ProfilePage: FC<{ tab: ProfileTab }> = memo(({ tab }) => {
  const profile = useRouteProfile();
  const user = profile.data;
  usePageTitle(user ? `${user.displayName} (${handleOf(user)})` : 'Profile');

  if (!user) {
    return (
      <BorderedMainContent>
        <ProfileProblem profile={profile} />
      </BorderedMainContent>
    );
  }

  return (
    <BorderedMainContent>
      <ProfileHeader user={user} />
      <TabLinks
        tabs={[
          {
            label: 'Casts',
            to: paths.profile(user, 'casts'),
            isFocused: tab === 'casts',
          },
          {
            label: 'Replies',
            to: paths.profile(user, 'replies'),
            isFocused: tab === 'replies',
          },
          {
            label: 'Likes',
            to: paths.profile(user, 'likes'),
            isFocused: tab === 'likes',
          },
        ]}
      />
      {tab === 'likes' ? (
        <LikesTab user={user} />
      ) : (
        <CastsTab key={tab} user={user} tab={tab} />
      )}
    </BorderedMainContent>
  );
});
ProfilePage.displayName = 'ProfilePage';

const FollowersTab: FC<{ user: User }> = memo(({ user }) => (
  <UserList
    list={useFollowers(user.fid)}
    subject="Followers"
    emptyMessage="No followers yet"
  />
));
FollowersTab.displayName = 'FollowersTab';

const FollowingTab: FC<{ user: User }> = memo(({ user }) => (
  <UserList
    list={useFollowingList(user.fid)}
    subject="Following"
    emptyMessage="Not following anyone yet"
  />
));
FollowingTab.displayName = 'FollowingTab';

const FollowListPage: FC<{ tab: 'followers' | 'following' }> = memo(
  ({ tab }) => {
    const profile = useRouteProfile();
    const user = profile.data;
    usePageTitle(
      user
        ? `${tab === 'followers' ? 'Followers of' : 'Followed by'} ${handleOf(user)}`
        : 'Profile',
    );

    if (!user) {
      return (
        <BorderedMainContent>
          <ProfileProblem profile={profile} />
        </BorderedMainContent>
      );
    }

    return (
      <BorderedMainContent>
        <PageHeader
          showBack
          visibleOnMobile
          hideCastButton
          footer={
            <TabLinks
              tabs={[
                {
                  label: 'Followers',
                  to: paths.followers(user),
                  isFocused: tab === 'followers',
                },
                {
                  label: 'Following',
                  to: paths.followingList(user),
                  isFocused: tab === 'following',
                },
              ]}
            />
          }
        >
          <PageTitle>{handleOf(user)}</PageTitle>
          <span className="truncate text-base font-semibold sm:hidden">
            {handleOf(user)}
          </span>
        </PageHeader>
        {tab === 'followers' ? (
          <FollowersTab user={user} />
        ) : (
          <FollowingTab user={user} />
        )}
      </BorderedMainContent>
    );
  },
);
FollowListPage.displayName = 'FollowListPage';

export { FollowListPage, ProfilePage };
