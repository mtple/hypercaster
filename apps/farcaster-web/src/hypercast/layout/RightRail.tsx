import { FC, memo } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { ChannelRow } from '~/hypercast/components/ChannelRow';
import { UserRow } from '~/hypercast/components/UserRow';
import { SearchBox } from '~/hypercast/layout/SearchBox';
import { SessionCard } from '~/hypercast/layout/SessionCard';
import { paths } from '~/hypercast/paths';
import { config } from '~/hypersnap/config';
import { useSuggestedFollows, useTrendingChannels } from '~/hypersnap/hooks';
import { subjectFidOf, useSession } from '~/hypersnap/session';
import { RightSideBar } from '~/layouts/RightSideBar';

const TrendingChannelsCard: FC = memo(() => {
  const { data } = useTrendingChannels(5);
  if (!data || data.length === 0) {
    return null;
  }
  return (
    <section
      aria-label="Trending channels"
      className="hidden rounded-xl px-2 py-3 pt-1.5 bg-surface-secondary mdlg:block"
    >
      <div className="p-2 pb-2 text-lg font-semibold">Trending channels</div>
      <div className="flex flex-col">
        {data.map((channel) => (
          <ChannelRow key={channel.id} channel={channel} compact />
        ))}
      </div>
      <Link
        to={paths.explore()}
        className="block px-2 pt-2 text-sm text-secondary hover:underline"
      >
        Show more
      </Link>
    </section>
  );
});
TrendingChannelsCard.displayName = 'TrendingChannelsCard';

const SuggestedCard: FC = memo(() => {
  const session = useSession();
  const subjectFid = subjectFidOf(session);
  const { data } = useSuggestedFollows(subjectFid);
  if (session.mode === 'guest' || !data || data.length === 0) {
    return null;
  }
  return (
    <section
      aria-label="Suggested accounts"
      className="hidden rounded-xl px-2 py-3 pt-1.5 bg-surface-secondary mdlg:block"
    >
      <div className="p-2 pb-1 text-lg font-semibold">
        Followed by people they follow
      </div>
      <div className="flex flex-col">
        {data.map((user) => (
          <UserRow key={user.fid} user={user} skipSeparator />
        ))}
      </div>
    </section>
  );
});
SuggestedCard.displayName = 'SuggestedCard';

const FooterLinks: FC = memo(() => (
  <div className="flex flex-row flex-wrap gap-x-2 gap-y-1 px-2 text-xs text-gray-500">
    <Link
      to={paths.about()}
      className="text-center text-secondary hover:underline"
    >
      About
    </Link>
    <Link
      to={paths.settings()}
      className="text-center text-secondary hover:underline"
    >
      Settings
    </Link>
    <span className="text-secondary">Reading from {config.nodeLabel}</span>
  </div>
));
FooterLinks.displayName = 'FooterLinks';

const RightRail: FC = memo(() => {
  const { pathname } = useLocation();
  const onSearchPage = pathname.startsWith('/~/search');
  const onSettings = pathname.startsWith('/~/settings');

  return (
    <aside className="max-w-[393px] grow">
      <RightSideBar as="div">
        {onSearchPage ? <></> : <SearchBox />}
        {!onSettings && <SessionCard />}
        <TrendingChannelsCard />
        <SuggestedCard />
        <FooterLinks />
      </RightSideBar>
    </aside>
  );
});

RightRail.displayName = 'RightRail';

export { RightRail };
