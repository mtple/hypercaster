import cn from 'classnames';
import { FC, memo, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { FullScreenLoadingIndicator } from '~/components/loaders/FullScreenLoadingIndicator';
import { RouteErrorBoundary } from '~/hypercast/components/RouteErrorBoundary';
import { LeftNav } from '~/hypercast/layout/LeftNav';
import { MobileHeader } from '~/hypercast/layout/MobileHeader';
import { RightRail } from '~/hypercast/layout/RightRail';
import { Container } from '~/layouts/Container';

/**
 * The three-column frame from the upstream client: navigation, a fixed
 * width main column, and a rail that appears on wide screens.
 */
const Shell: FC = memo(() => {
  const location = useLocation();
  return (
    <Container>
      <LeftNav />
      <main
        className={cn(
          'h-full w-full shrink-0 justify-center',
          'sm:mr-4 sm:w-[540px] lg:w-[620px]',
        )}
      >
        <MobileHeader />
        <Suspense fallback={<FullScreenLoadingIndicator />}>
          <RouteErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </RouteErrorBoundary>
        </Suspense>
      </main>
      <RightRail />
    </Container>
  );
});

Shell.displayName = 'Shell';

export { Shell };
