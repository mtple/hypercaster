import classNames from 'classnames';
import { ChevronDown, SearchIcon, XIcon } from 'lucide-react';
import { FC, memo, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { ComposeCastButton } from '~/components/forms/buttons/ComposeCastButton';
import { Logo } from '~/hypercast/components/Logo';
import {
  currentEntry,
  DropdownNavLink,
  navEntries,
} from '~/hypercast/layout/nav';
import { SearchBox } from '~/hypercast/layout/SearchBox';
import { SessionCard } from '~/hypercast/layout/SessionCard';
import { paths } from '~/hypercast/paths';
import { useWrites } from '~/hypercast/write/WriteContext';
import { config } from '~/hypersnap/config';
import { useSession } from '~/hypersnap/session';

/**
 * The bar shown below the "sm" breakpoint, where the sidebars are hidden:
 * mark, a page-title button that opens the navigation, and search.
 */
const MobileHeader: FC = memo(() => {
  const session = useSession();
  const writes = useWrites();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  useEffect(() => {
    setIsSearchOpen(false);
    setIsMenuOpen(false);
  }, [location.pathname]);

  const entries = navEntries(session);
  const title =
    currentEntry(entries, location.pathname)?.label ?? config.appName;

  return (
    <div className="sm:hidden">
      <div className="relative">
        <nav
          aria-label="Main"
          className="sticky top-0 z-50 flex w-full flex-row items-center justify-between gap-2 border-b px-3 py-2 bg-app border-default"
        >
          {isSearchOpen ? (
            <>
              <button
                type="button"
                onClick={() => setIsSearchOpen(false)}
                className="flex shrink-0 items-center justify-center rounded-lg p-1.5 hover:bg-overlay-faint active:bg-overlay-faint"
                aria-label="Close search"
              >
                <XIcon size={18} className="text-default" />
              </button>
              <div className="flex-1">
                <SearchBox autoFocus />
              </div>
            </>
          ) : (
            <>
              <Link
                to={paths.home()}
                title={`${config.appName} home`}
                className="flex shrink-0 items-center"
              >
                <Logo size={24} />
              </Link>

              <button
                type="button"
                onClick={() => setIsMenuOpen((previous) => !previous)}
                aria-expanded={isMenuOpen}
                aria-controls="mobile-nav-menu"
                className="flex flex-1 items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-overlay-faint active:bg-overlay-faint"
              >
                <span className="text-base font-semibold text-default">
                  {title}
                </span>
                <ChevronDown
                  size={14}
                  className={classNames(
                    'text-muted transition-transform duration-150',
                    isMenuOpen && 'rotate-180',
                  )}
                />
              </button>

              <button
                type="button"
                onClick={() => setIsSearchOpen(true)}
                className="flex shrink-0 items-center justify-center rounded-lg p-1.5 hover:bg-overlay-faint active:bg-overlay-faint"
                aria-label="Search"
              >
                <SearchIcon size={18} className="text-default" />
              </button>

              {writes.capabilities.canPost && (
                <ComposeCastButton
                  size="sm"
                  onClick={() => writes.openComposer()}
                >
                  Cast
                </ComposeCastButton>
              )}
            </>
          )}
        </nav>

        {!isSearchOpen && isMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              aria-hidden="true"
              onClick={() => setIsMenuOpen(false)}
            />
            <div
              id="mobile-nav-menu"
              className="absolute inset-x-0 top-full z-50 max-h-[80vh] overflow-y-auto border-b shadow-lg bg-app border-default"
            >
              <div className="flex flex-col p-2">
                {entries.map((entry) => (
                  <DropdownNavLink
                    key={entry.key}
                    entry={entry}
                    onClose={() => setIsMenuOpen(false)}
                  />
                ))}
              </div>
              <SessionCard variant="inline" />
            </div>
          </>
        )}
      </div>
    </div>
  );
});

MobileHeader.displayName = 'MobileHeader';

export { MobileHeader };
