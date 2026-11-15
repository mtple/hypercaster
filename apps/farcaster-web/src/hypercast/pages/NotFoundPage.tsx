import { FC, memo } from 'react';
import { Link } from 'react-router-dom';

import { BorderedMainContent } from '~/components/BorderedMainContent';
import { PageHeader, PageTitle } from '~/hypercast/components/PageHeader';
import { paths } from '~/hypercast/paths';
import { usePageTitle } from '~/hypercast/usePageTitle';
import { config } from '~/hypersnap/config';

type NotFoundPageProps = {
  /**
   * "app": an address under "/~/" that this client has no screen for,
   * typically a feature of the upstream client that needs its private
   * services. "unknown": anything else.
   */
  kind: 'app' | 'unknown';
};

const NotFoundPage: FC<NotFoundPageProps> = memo(({ kind }) => {
  usePageTitle('Page not found');
  return (
    <BorderedMainContent>
      <PageHeader showBack visibleOnMobile hideCastButton>
        <PageTitle>Not found</PageTitle>
        <span className="text-base font-semibold sm:hidden">Not found</span>
      </PageHeader>
      <div className="flex flex-col items-center px-6 py-16 text-center">
        <h1 className="text-lg font-semibold text-default">
          {kind === 'app'
            ? `This isn’t available in ${config.appName}`
            : 'There’s nothing at this address'}
        </h1>
        <p className="max-w-[420px] pt-1 text-sm text-muted">
          {kind === 'app'
            ? 'Direct messages, wallets, mini apps and some other screens depend on services this client does not use, so they are not part of it.'
            : 'The link may be mistyped or out of date.'}
        </p>
        <Link to={paths.home()} className="pt-4 text-sm hover:underline">
          Go to Home
        </Link>
      </div>
    </BorderedMainContent>
  );
});

NotFoundPage.displayName = 'NotFoundPage';

export { NotFoundPage };
