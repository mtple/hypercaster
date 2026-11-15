import { HashIcon } from 'lucide-react';
import { FC, memo } from 'react';
import { Link } from 'react-router-dom';

import { formatCount, pluralize } from '~/hypercast/format';
import { paths } from '~/hypercast/paths';
import type { Channel } from '~/hypersnap/types';

/** Channels on Hypersnap carry no artwork, so they get a neutral glyph. */
const ChannelGlyph: FC<{ size?: number }> = memo(({ size = 36 }) => (
  <span
    className="flex shrink-0 items-center justify-center rounded-full text-muted bg-surface-secondary"
    style={{ width: size, height: size }}
    aria-hidden="true"
  >
    <HashIcon size={Math.round(size / 2)} />
  </span>
));
ChannelGlyph.displayName = 'ChannelGlyph';

const memberLabel = (channel: Channel): string =>
  channel.memberCount === null
    ? ''
    : `${formatCount(channel.memberCount)} ${pluralize(channel.memberCount, 'member', 'members')}`;

const ChannelRow: FC<{ channel: Channel; compact?: boolean }> = memo(
  ({ channel, compact = false }) => (
    <Link
      to={paths.channel(channel.id)}
      title={`/${channel.id}`}
      className={
        compact
          ? 'flex flex-row items-center gap-3 rounded-lg px-2 py-2 !text-inherit hover:bg-overlay-faint'
          : 'flex flex-row items-center gap-3 border-b px-3 py-2 !text-inherit border-default hover:bg-overlay-faint'
      }
    >
      <ChannelGlyph size={compact ? 32 : 36} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-base font-semibold text-default">
          /{channel.id}
        </span>
        {memberLabel(channel) !== '' && (
          <span className="truncate text-sm text-muted">
            {memberLabel(channel)}
          </span>
        )}
      </span>
    </Link>
  ),
);
ChannelRow.displayName = 'ChannelRow';

export { ChannelGlyph, ChannelRow, memberLabel };
