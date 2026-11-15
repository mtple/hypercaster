import { useQueryClient } from '@tanstack/react-query';
import cn from 'classnames';
import { FC, memo, ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';

import { BorderedMainContent } from '~/components/BorderedMainContent';
import { DefaultButton } from '~/components/forms/buttons/DefaultButton';
import {
  type UserSavedTheme,
  useUserSavedTheme,
} from '~/hooks/theme/useUserSavedTheme';
import { PageHeader, PageTitle } from '~/hypercast/components/PageHeader';
import { describeError } from '~/hypercast/components/StateViews';
import { SessionCard } from '~/hypercast/layout/SessionCard';
import { paths } from '~/hypercast/paths';
import { usePageTitle } from '~/hypercast/usePageTitle';
import { useWrites } from '~/hypercast/write/WriteContext';
import { useBookmarks } from '~/hypersnap/bookmarks';
import { config } from '~/hypersnap/config';
import { useNodeInfo } from '~/hypersnap/hooks';
import { clearAll } from '~/hypersnap/storage';

const Section: FC<{ title: string; children: ReactNode }> = memo(
  ({ title, children }) => (
    <section className="border-b px-4 py-5 border-default">
      <h2 className="pb-2 text-base font-semibold text-default">{title}</h2>
      {children}
    </section>
  ),
);
Section.displayName = 'Section';

const THEMES: { value: UserSavedTheme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const AppearanceSection: FC = memo(() => {
  const { userSavedTheme, setUserSavedTheme } = useUserSavedTheme();
  return (
    <Section title="Appearance">
      <div role="radiogroup" aria-label="Theme" className="flex flex-row gap-2">
        {THEMES.map((theme) => {
          const selected = userSavedTheme === theme.value;
          return (
            <button
              key={theme.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setUserSavedTheme(theme.value)}
              className={cn(
                'cursor-pointer rounded-full border px-4 py-2 text-sm font-semibold',
                selected
                  ? 'border-transparent bg-action-primary text-light'
                  : 'bg-action-secondary border-default text-default hover:bg-overlay-faint',
              )}
            >
              {theme.label}
            </button>
          );
        })}
      </div>
    </Section>
  );
});
AppearanceSection.displayName = 'AppearanceSection';

const NodeSection: FC = memo(() => {
  const [shouldCheck, setShouldCheck] = useState(false);
  const info = useNodeInfo(shouldCheck);
  return (
    <Section title="Hypersnap node">
      <p className="text-sm text-muted">
        Everything {config.appName} shows is read from{' '}
        <span className="font-semibold text-default">{config.nodeLabel}</span>.
        The node is chosen when the site is built.
      </p>
      <div className="pt-3">
        <DefaultButton
          variant="secondary"
          isLoading={info.isFetching}
          onClick={() =>
            shouldCheck ? void info.refetch() : setShouldCheck(true)
          }
        >
          Check node status
        </DefaultButton>
      </div>
      {shouldCheck && info.isError && (
        <div role="alert" className="pt-3 text-sm text-danger">
          {describeError(info.error, 'Node').title}.{' '}
          {describeError(info.error, 'Node').detail}
        </div>
      )}
      {info.data && (
        <dl
          role="status"
          className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 pt-3 text-sm"
        >
          <dt className="text-muted">Status</dt>
          <dd className="text-default">Responding</dd>
          {info.data.numMessages !== null && (
            <>
              <dt className="text-muted">Messages stored</dt>
              <dd className="text-default">
                {info.data.numMessages.toLocaleString()}
              </dd>
            </>
          )}
          {info.data.shardHeights.map((shard) => (
            <div key={shard.shardId} className="contents">
              <dt className="text-muted">Shard {shard.shardId} height</dt>
              <dd className="text-default">
                {shard.maxHeight.toLocaleString()}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Section>
  );
});
NodeSection.displayName = 'NodeSection';

const LocalDataSection: FC = memo(() => {
  const queryClient = useQueryClient();
  const bookmarks = useBookmarks();
  const writes = useWrites();
  return (
    <Section title="Data on this device">
      <p className="text-sm text-muted">
        {config.appName} keeps your theme, the account you chose to view, and{' '}
        {bookmarks.length} {bookmarks.length === 1 ? 'bookmark' : 'bookmarks'}{' '}
        in this browser. None of it is sent anywhere.
      </p>
      <div className="pt-3">
        <DefaultButton
          variant="secondary"
          onClick={() => {
            const warning = writes.signedInFid
              ? 'Clear everything saved on this device? You will be signed out here; the signing key stays registered until you sign out.'
              : 'Clear everything saved on this device? This removes bookmarks and the account you are viewing.';
            if (window.confirm(warning)) {
              clearAll();
              queryClient.clear();
            }
          }}
        >
          Clear local data
        </DefaultButton>
      </div>
    </Section>
  );
});
LocalDataSection.displayName = 'LocalDataSection';

const SettingsPage: FC = memo(() => {
  usePageTitle('Settings');
  const writes = useWrites();
  const writesAvailable =
    writes.capabilities.canSignIn || writes.signedInFid !== null;

  return (
    <BorderedMainContent>
      <PageHeader visibleOnMobile hideCastButton>
        <PageTitle>Settings</PageTitle>
        <span className="text-base font-semibold sm:hidden">Settings</span>
      </PageHeader>
      <AppearanceSection />
      <SessionCard variant="inline" />
      <Section title="Posting">
        <p className="text-sm text-muted">
          {writesAvailable
            ? 'This build can sign in with an account’s custody wallet and send casts, likes, recasts and follows to the node. Signing happens in this browser.'
            : 'This build is read-only. Posting, liking, recasting and following are switched off, and no request other than a read can leave this page.'}
        </p>
      </Section>
      <NodeSection />
      <LocalDataSection />
      <Section title="About">
        <Link to={paths.about()} className="text-sm hover:underline">
          About {config.appName}, the network it reads, and its licence
        </Link>
      </Section>
    </BorderedMainContent>
  );
});

SettingsPage.displayName = 'SettingsPage';

export { SettingsPage };
