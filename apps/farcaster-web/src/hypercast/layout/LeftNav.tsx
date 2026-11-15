import { FC, memo } from 'react';
import { Link } from 'react-router-dom';

import { Logo } from '~/hypercast/components/Logo';
import { navEntries, SideNavLink, useNavRefresh } from '~/hypercast/layout/nav';
import { paths } from '~/hypercast/paths';
import { config } from '~/hypersnap/config';
import { useUserByFid } from '~/hypersnap/hooks';
import { subjectFidOf, useSession } from '~/hypersnap/session';
import { LeftSideBar } from '~/layouts/LeftSideBar';

const LeftNav: FC = memo(() => {
  const session = useSession();
  const refresh = useNavRefresh();
  const subject = useUserByFid(subjectFidOf(session));

  return (
    <LeftSideBar className="justify-between pb-4">
      <div className="flex grow flex-col space-y-1 xl:w-full">
        <div className="flex flex-row items-center justify-center xl:justify-between">
          <Link
            to={paths.home()}
            title={`${config.appName} home`}
            className="mx-1 flex items-center !text-inherit"
            onClick={refresh}
          >
            <div className="flex h-14 flex-row items-center justify-center gap-2 md:items-center">
              <Logo size={24} />
              <span className="hidden text-lg font-bold tracking-tight text-default xl:block">
                {config.appName}
              </span>
            </div>
          </Link>
        </div>
        <nav aria-label="Main" className="flex flex-col space-y-1">
          {navEntries(session).map((entry) => (
            <SideNavLink
              key={entry.key}
              entry={entry}
              avatarUrl={
                entry.key === 'profile'
                  ? (subject.data?.pfpUrl ?? null)
                  : undefined
              }
            />
          ))}
        </nav>
      </div>
    </LeftSideBar>
  );
});

LeftNav.displayName = 'LeftNav';

export { LeftNav };
