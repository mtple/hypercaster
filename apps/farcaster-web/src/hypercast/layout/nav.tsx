import { GearIcon } from '@primer/octicons-react';
import { useQueryClient } from '@tanstack/react-query';
import cn from 'classnames';
import {
  Archive,
  BellIcon,
  CompassIcon,
  HomeIcon,
  InfoIcon,
  UserIcon,
} from 'lucide-react';
import { FC, memo, ReactNode, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { NavLinkContainer } from '~/components/links/NavLinkContainer';
import { NavLinkIcon } from '~/components/links/NavLinkIcon';
import { NavLinkLabel } from '~/components/links/NavLinkLabel';
import { AvatarImage } from '~/hypercast/components/Avatar';
import { paths } from '~/hypercast/paths';
import { queryKeys } from '~/hypersnap/queryKeys';
import type { Session } from '~/hypersnap/session';

type NavEntry = {
  key: string;
  label: string;
  to: string;
  /** Path prefixes that count as "inside" this section. */
  matches: (pathname: string) => boolean;
  icon: (size: number) => ReactNode;
};

const isHome = (pathname: string) =>
  pathname === '/' || pathname === paths.following();

function navEntries(session: Session): NavEntry[] {
  const entries: NavEntry[] = [
    {
      key: 'home',
      label: 'Home',
      to: paths.home(),
      matches: isHome,
      icon: (size) => (
        <div className="-translate-y-px">
          <HomeIcon size={size} />
        </div>
      ),
    },
    {
      key: 'notifications',
      label: 'Notifications',
      to: paths.notifications(),
      matches: (pathname) => pathname.startsWith('/~/notifications'),
      icon: (size) => (
        <div className="relative translate-y-[-1.25px]">
          <BellIcon size={size} />
        </div>
      ),
    },
    {
      key: 'explore',
      label: 'Explore',
      to: paths.explore(),
      matches: (pathname) =>
        pathname.startsWith('/~/explore') || pathname.startsWith('/~/channel'),
      icon: (size) => (
        <div className="relative translate-y-[-1.25px]">
          <CompassIcon size={size} />
        </div>
      ),
    },
    {
      key: 'saved',
      label: 'Saved',
      to: paths.bookmarks(),
      matches: (pathname) =>
        pathname.startsWith('/~/bookmarks') || pathname.startsWith('/~/saved'),
      icon: (size) => (
        <div className="relative translate-y-[-0.75px]">
          <Archive size={size} />
        </div>
      ),
    },
    {
      key: 'settings',
      label: 'Settings',
      to: paths.settings(),
      matches: (pathname) => pathname.startsWith('/~/settings'),
      icon: (size) => <GearIcon size={size} />,
    },
    {
      key: 'about',
      label: 'About',
      to: paths.about(),
      matches: (pathname) => pathname.startsWith('/~/about'),
      icon: (size) => (
        <div className="relative translate-y-[-0.75px]">
          <InfoIcon size={size} />
        </div>
      ),
    },
  ];

  if (session.mode !== 'guest') {
    const profilePath = paths.profile(session);
    entries.push({
      key: 'profile',
      label: 'Profile',
      to: profilePath,
      matches: (pathname) =>
        pathname === profilePath || pathname.startsWith(`${profilePath}/`),
      icon: (size) => (
        <div className="translate-y-[-1.25px]">
          <UserIcon size={size} />
        </div>
      ),
    });
  }

  return entries;
}

function currentEntry(
  entries: NavEntry[],
  pathname: string,
): NavEntry | undefined {
  return entries.find((entry) => entry.matches(pathname));
}

/**
 * Clicking the section you are already in scrolls to the top and re-reads
 * what is on screen from the node, as the upstream navigation does.
 */
function useNavRefresh() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.root,
      refetchType: 'active',
    });
  }, [queryClient]);
}

type SideNavLinkProps = {
  entry: NavEntry;
  avatarUrl?: string | null;
};

/** A left-sidebar link, built from the upstream nav-link parts. */
const SideNavLink: FC<SideNavLinkProps> = memo(({ entry, avatarUrl }) => {
  const { pathname } = useLocation();
  const refresh = useNavRefresh();
  const isActive = entry.matches(pathname);

  return (
    <Link
      to={entry.to}
      title={entry.label}
      aria-current={isActive ? 'page' : undefined}
      className="relative"
      onClick={() => {
        if (isActive && pathname === entry.to) {
          refresh();
        }
      }}
    >
      <NavLinkContainer isRelatedToCurrentRoute={isActive} isLoading={false}>
        <NavLinkIcon>
          {entry.key === 'profile' && avatarUrl !== undefined ? (
            <div className="translate-y-[-1.25px]">
              <AvatarImage
                url={avatarUrl}
                alt=""
                size="xs"
                className="hover:bg-transparent"
              />
            </div>
          ) : (
            entry.icon(20)
          )}
        </NavLinkIcon>
        <NavLinkLabel bold={isActive}>{entry.label}</NavLinkLabel>
      </NavLinkContainer>
    </Link>
  );
});
SideNavLink.displayName = 'SideNavLink';

const selectedNavBackgroundClasses = 'bg-surface-secondary font-semibold';

/** A row in the mobile dropdown menu. */
const DropdownNavLink: FC<{ entry: NavEntry; onClose: () => void }> = memo(
  ({ entry, onClose }) => {
    const { pathname } = useLocation();
    const isActive = entry.matches(pathname);
    return (
      <Link
        to={entry.to}
        onClick={onClose}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-4 py-3',
          isActive
            ? selectedNavBackgroundClasses
            : 'text-default hover:bg-overlay-faint active:bg-overlay-faint',
        )}
      >
        <span className="flex shrink-0 text-default">{entry.icon(16)}</span>
        <span className="grow text-sm text-default">{entry.label}</span>
      </Link>
    );
  },
);
DropdownNavLink.displayName = 'DropdownNavLink';

export {
  currentEntry,
  DropdownNavLink,
  navEntries,
  SideNavLink,
  useNavRefresh,
};
export type { NavEntry };
