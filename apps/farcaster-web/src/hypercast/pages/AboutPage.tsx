import { FC, memo, ReactNode } from 'react';

import { BorderedMainContent } from '~/components/BorderedMainContent';
import { Logo } from '~/hypercast/components/Logo';
import { PageHeader, PageTitle } from '~/hypercast/components/PageHeader';
import { usePageTitle } from '~/hypercast/usePageTitle';
import { useWrites } from '~/hypercast/write/WriteContext';
import { config } from '~/hypersnap/config';

const Block: FC<{ title: string; children: ReactNode }> = memo(
  ({ title, children }) => (
    <section className="border-b px-4 py-5 border-default">
      <h2 className="pb-2 text-base font-semibold text-default">{title}</h2>
      <div className="flex flex-col gap-2 text-sm leading-5 text-muted">
        {children}
      </div>
    </section>
  ),
);
Block.displayName = 'Block';

const AboutPage: FC = memo(() => {
  usePageTitle('About');
  const writes = useWrites();
  const writesAvailable =
    writes.capabilities.canSignIn || writes.signedInFid !== null;

  return (
    <BorderedMainContent>
      <PageHeader visibleOnMobile hideCastButton>
        <PageTitle>About</PageTitle>
        <span className="text-base font-semibold sm:hidden">About</span>
      </PageHeader>

      <section className="flex flex-row items-center gap-3 border-b px-4 py-6 border-default">
        <Logo size={40} />
        <div>
          <h1 className="text-xl font-bold text-default">{config.appName}</h1>
          <p className="text-sm text-muted">
            An independent social client powered by Hypersnap.
          </p>
        </div>
      </section>

      <Block title={`About ${config.appName}`}>
        <p>
          {config.appName} is an independent social client powered by Hypersnap.
          It is built using open-source Farcaster client code and is not
          affiliated with or endorsed by the operators of the official Farcaster
          client.
        </p>
      </Block>

      <Block title="What you are looking at">
        <p>
          Every cast, profile, channel and notification here is read from one
          Hypersnap node,{' '}
          <span className="font-semibold text-default">{config.nodeLabel}</span>
          , and shown as that node has it. Nothing is filled in from any other
          service.
        </p>
        <p>
          Hypersnap and Snapchain share history and message formats but are
          separate networks. A relay can carry messages between them, and it can
          also be behind, paused, or decline a message. So this is not a mirror
          of any other client: counts, feeds and search results can differ, and
          something missing here may still exist elsewhere. Accounts registered
          on Hypersnap itself exist only on Hypersnap.
        </p>
        <p>
          “Not found on this Hypersnap node” means exactly that, and nothing
          more.
        </p>
      </Block>

      <Block title="Viewing an account is not signing in">
        <p>
          You can pick any account and see its following feed and notifications,
          because both are public. Doing so gives you no control over the
          account and proves nothing about who you are. {config.appName} always
          labels this as a public view.
        </p>
      </Block>

      <Block title="Posting">
        {writesAvailable ? (
          <>
            <p>
              This build can sign in and post. Signing in asks the account’s
              custody wallet to approve a new signing key, which is created in
              this browser and cannot be read back out of it. The key may only
              cast, react and follow.
            </p>
            <p>
              A cast is shown as sent once the node accepts it. Whether it then
              reaches any other network depends on the relay, and{' '}
              {config.appName} does not claim that it will.
            </p>
          </>
        ) : (
          <p>
            This build is read-only. Reply, recast, like and follow controls are
            shown where the interface has always had them, but they are switched
            off and nothing is sent.
          </p>
        )}
      </Block>

      <Block title="Privacy">
        <p>
          There are no accounts on this site, no analytics and no tracking. Your
          theme, the account you chose to view and your bookmarks stay in this
          browser.
        </p>
        <p>
          Images, video and links in casts and profiles load from wherever their
          authors put them, so those hosts see your request the way any website
          would.
        </p>
      </Block>

      <Block title="Licence and credits">
        <p>
          The interface is derived from the open-source Farcaster client,
          copyright © 2026 Neynar, Inc., and used under the MIT licence.{' '}
          {config.appName}’s own name and mark are not part of that project.
          “Farcaster” refers here to the protocol and to the upstream code only.
        </p>
        <p>The full licence text and attribution ship with the source code.</p>
      </Block>
    </BorderedMainContent>
  );
});

AboutPage.displayName = 'AboutPage';

export { AboutPage };
