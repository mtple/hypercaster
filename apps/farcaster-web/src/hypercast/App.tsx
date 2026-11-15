import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FC, lazy, ReactNode, Suspense, useEffect } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';

import { GlobalKeyPressProvider } from '~/contexts/GlobalKeyPressProvider';
import { ThemeProvider } from '~/contexts/ThemeProvider';
import { Shell } from '~/hypercast/layout/Shell';
import { AboutPage } from '~/hypercast/pages/AboutPage';
import { BookmarksPage } from '~/hypercast/pages/BookmarksPage';
import { CastReactionsPage } from '~/hypercast/pages/CastReactionsPage';
import { ChannelPage } from '~/hypercast/pages/ChannelPage';
import { ConversationPage } from '~/hypercast/pages/ConversationPage';
import { ExplorePage } from '~/hypercast/pages/ExplorePage';
import { HomePage } from '~/hypercast/pages/HomePage';
import { NotFoundPage } from '~/hypercast/pages/NotFoundPage';
import { NotificationsPage } from '~/hypercast/pages/NotificationsPage';
import { FollowListPage, ProfilePage } from '~/hypercast/pages/ProfilePage';
import { SearchPage } from '~/hypercast/pages/SearchPage';
import { SettingsPage } from '~/hypercast/pages/SettingsPage';
import { paths } from '~/hypercast/paths';

/**
 * Evaluated at build time. In a read-only build this is the literal
 * `false`, the import below is unreachable, and the bundler leaves the
 * whole write module out of the output.
 */
const WRITES_ENABLED = import.meta.env.VITE_ENABLE_WRITES === 'true';

const WriteProvider = WRITES_ENABLED
  ? lazy(() =>
      import('~/hypercast/write/WriteProvider').then((module) => ({
        default: module.WriteProvider,
      })),
    )
  : null;

const Writes: FC<{ children: ReactNode }> = ({ children }) =>
  WriteProvider ? (
    <Suspense fallback={children}>
      <WriteProvider>{children}</WriteProvider>
    </Suspense>
  ) : (
    <>{children}</>
  );

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The transport already retries transient failures with backoff.
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  },
});

/**
 * A newly opened screen starts at the top. Back and forward are left to the
 * browser so it can restore where you were, and switching tabs within a
 * screen (a history replace) does not move the page.
 */
const ScrollToTopOnNavigate: FC = () => {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  useEffect(() => {
    if (navigationType === 'PUSH') {
      window.scrollTo(0, 0);
    }
  }, [navigationType, pathname]);
  return null;
};

const AppRoutes: FC = () => (
  <Routes>
    <Route element={<Shell />}>
      <Route path="/" element={<HomePage tab="trending" />} />
      <Route path="/~/following" element={<HomePage tab="following" />} />
      <Route path="/~/notifications" element={<NotificationsPage />} />
      <Route
        path="/~/notifications/*"
        element={<Navigate to={paths.notifications()} replace />}
      />
      <Route path="/~/bookmarks" element={<BookmarksPage />} />
      <Route
        path="/~/saved"
        element={<Navigate to={paths.bookmarks()} replace />}
      />

      <Route
        path="/~/explore"
        element={<Navigate to={paths.explore()} replace />}
      />
      <Route
        path="/~/explore/channels"
        element={<ExplorePage tab="channels" />}
      />
      <Route path="/~/explore/users" element={<ExplorePage tab="users" />} />

      <Route
        path="/~/search"
        element={<Navigate to={paths.search('casts', '')} replace />}
      />
      <Route path="/~/search/top" element={<SearchPage tab="casts" />} />
      <Route path="/~/search/recent" element={<SearchPage tab="casts" />} />
      <Route path="/~/search/users" element={<SearchPage tab="users" />} />
      <Route
        path="/~/search/channels"
        element={<SearchPage tab="channels" />}
      />

      <Route
        path="/~/channel/:channelKey"
        element={<ChannelPage tab="feed" />}
      />
      <Route
        path="/~/channel/:channelKey/members"
        element={<ChannelPage tab="members" />}
      />
      <Route
        path="/~/channel/:channelKey/followers"
        element={<ChannelPage tab="members" />}
      />

      <Route path="/~/conversations/:castHash" element={<ConversationPage />} />
      <Route
        path="/~/conversations/:castHash/reactions"
        element={<CastReactionsPage tab="likes" />}
      />
      <Route
        path="/~/conversations/:castHash/recasts"
        element={<CastReactionsPage tab="recasts" />}
      />
      <Route
        path="/~/conversations/:castHash/quotes"
        element={<CastReactionsPage tab="quotes" />}
      />

      <Route path="/~/profiles/:fid" element={<ProfilePage tab="casts" />} />
      <Route
        path="/~/profiles/:fid/casts-and-replies"
        element={<ProfilePage tab="replies" />}
      />
      <Route
        path="/~/profiles/:fid/likes"
        element={<ProfilePage tab="likes" />}
      />
      <Route
        path="/~/profiles/:fid/followers"
        element={<FollowListPage tab="followers" />}
      />
      <Route
        path="/~/profiles/:fid/following"
        element={<FollowListPage tab="following" />}
      />

      <Route path="/~/settings" element={<SettingsPage />} />
      <Route path="/~/about" element={<AboutPage />} />
      {/* Screens of the upstream client that need services this one does not use. */}
      <Route path="/~/*" element={<NotFoundPage kind="app" />} />

      <Route path="/:username" element={<ProfilePage tab="casts" />} />
      <Route
        path="/:username/casts-and-replies"
        element={<ProfilePage tab="replies" />}
      />
      <Route path="/:username/likes" element={<ProfilePage tab="likes" />} />
      <Route
        path="/:username/followers"
        element={<FollowListPage tab="followers" />}
      />
      <Route
        path="/:username/following"
        element={<FollowListPage tab="following" />}
      />
      <Route path="/:username/:castHashPrefix" element={<ConversationPage />} />
      <Route
        path="/:username/:castHashPrefix/reactions"
        element={<CastReactionsPage tab="likes" />}
      />
      <Route
        path="/:username/:castHashPrefix/recasts"
        element={<CastReactionsPage tab="recasts" />}
      />
      <Route
        path="/:username/:castHashPrefix/quotes"
        element={<CastReactionsPage tab="quotes" />}
      />

      <Route path="*" element={<NotFoundPage kind="unknown" />} />
    </Route>
  </Routes>
);

/**
 * The whole provider tree: query cache, theme, key handling, router. None
 * of the upstream client's network-bound providers are mounted.
 */
const App: FC = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <GlobalKeyPressProvider>
        <BrowserRouter>
          <Writes>
            <ScrollToTopOnNavigate />
            <AppRoutes />
          </Writes>
        </BrowserRouter>
      </GlobalKeyPressProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export { App, AppRoutes, queryClient };
