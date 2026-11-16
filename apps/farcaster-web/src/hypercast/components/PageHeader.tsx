import cn from 'classnames';
import { RefreshCwIcon, SearchIcon, XIcon } from 'lucide-react';
import { FC, memo, ReactNode, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { ComposeCastButton } from '~/components/forms/buttons/ComposeCastButton';
import { Tab } from '~/components/tabs/Tab';
import { Tabs } from '~/components/tabs/Tabs';
import { BackButton } from '~/hypercast/components/BackButton';
import { SearchBox } from '~/hypercast/layout/SearchBox';
import { useWrites } from '~/hypercast/write/WriteContext';

const PageTitle: FC<{ children: ReactNode }> = memo(({ children }) => (
  <h2 className="font hidden min-w-0 flex-row items-center text-center text-xl font-bold decoration-0 sm:flex sm:text-left">
    {children}
  </h2>
));
PageTitle.displayName = 'PageTitle';

type PageHeaderProps = {
  children: ReactNode;
  footer?: ReactNode;
  showBack?: boolean;
  hideCastButton?: boolean;
  visibleOnMobile?: boolean;
  /** Re-read this page's data from the node. */
  onRefresh?: () => void;
  isRefreshing?: boolean;
};

/**
 * The sticky bar at the top of the main column, following the upstream
 * layout. The "Cast" button appears only for a signed-in account.
 */
const PageHeader: FC<PageHeaderProps> = memo(
  ({
    children,
    footer,
    showBack = false,
    hideCastButton = false,
    visibleOnMobile = false,
    onRefresh,
    isRefreshing = false,
  }) => {
    const writes = useWrites();
    const location = useLocation();
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    useEffect(() => {
      setIsSearchOpen(false);
    }, [location.pathname]);

    return (
      <nav
        className={cn(
          'sticky top-0 z-10 flex-col border-b-0 bg-app border-default',
          // Title row and tabs are each 56px. On a phone the title row is
          // only there when the page asks for it.
          typeof footer === 'undefined'
            ? 'sm:border-b'
            : visibleOnMobile
              ? 'h-28'
              : 'h-14 sm:h-28',
        )}
      >
        <div
          className={cn(
            visibleOnMobile ? 'flex px-4' : 'hidden sm:flex sm:px-4',
            'h-14 flex-row items-center justify-between',
          )}
        >
          {isSearchOpen ? (
            <>
              <button
                type="button"
                onClick={() => setIsSearchOpen(false)}
                className="flex shrink-0 items-center justify-center rounded-lg p-1.5 hover:bg-overlay-faint"
                aria-label="Close search"
              >
                <XIcon size={18} className="text-default" />
              </button>
              <div className="flex-1 px-2">
                <SearchBox autoFocus />
              </div>
            </>
          ) : (
            <>
              <div className="flex min-w-0 flex-row items-center">
                {showBack && <BackButton />}
                {children}
              </div>
              <div className="hidden shrink-0 flex-row items-center space-x-2 sm:flex">
                {onRefresh && (
                  <button
                    type="button"
                    onClick={onRefresh}
                    className="flex items-center justify-center rounded-lg p-1.5 hover:bg-overlay-faint"
                    aria-label="Refresh"
                    title="Refresh"
                  >
                    <RefreshCwIcon
                      size={18}
                      className={cn(
                        'text-default',
                        isRefreshing && 'animate-spin',
                      )}
                    />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsSearchOpen(true)}
                  className="flex items-center justify-center rounded-lg p-1.5 hover:bg-overlay-faint mdlg:hidden"
                  aria-label="Search"
                >
                  <SearchIcon size={18} className="text-default" />
                </button>
                {writes.capabilities.canPost && !hideCastButton && (
                  <ComposeCastButton onClick={() => writes.openComposer()}>
                    Cast
                  </ComposeCastButton>
                )}
              </div>
            </>
          )}
        </div>
        {footer && <div>{footer}</div>}
      </nav>
    );
  },
);
PageHeader.displayName = 'PageHeader';

type TabLink = { label: string; to: string; isFocused: boolean };

/** A row of tabs that are real links, so each tab has its own URL. */
const TabLinks: FC<{ tabs: TabLink[]; className?: string }> = memo(
  ({ tabs, className }) => (
    <Tabs className={className}>
      {tabs.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          title={tab.label}
          replace
          aria-current={tab.isFocused ? 'page' : undefined}
          className="flex size-full items-center justify-center text-inherit"
        >
          <Tab isFocused={tab.isFocused}>{tab.label}</Tab>
        </Link>
      ))}
    </Tabs>
  ),
);
TabLinks.displayName = 'TabLinks';

export { PageHeader, PageTitle, TabLinks };
export type { TabLink };
