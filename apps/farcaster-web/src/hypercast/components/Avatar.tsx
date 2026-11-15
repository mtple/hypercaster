import cn from 'classnames';
import { FC, memo } from 'react';
import { Link } from 'react-router-dom';

import { Image } from '~/components/images/Image';
import { paths } from '~/hypercast/paths';
import type { User } from '~/hypersnap/types';

/** Diameters in pixels, as in the upstream interface. */
const AVATAR_SIZES = {
  xs2: 16,
  xs: 20,
  sm1: 24,
  sm: 36,
  md: 48,
  lg: 56,
  xl: 80,
  xl2: 96,
} as const;

type AvatarSize = keyof typeof AVATAR_SIZES;

const DEFAULT_AVATAR = '/default-avatar.svg';

type AvatarImageProps = {
  url: string | null;
  alt: string;
  size?: AvatarSize;
  className?: string;
  priority?: boolean;
};

/**
 * The picture is loaded straight from the URL in the user's profile. There
 * is no resizing proxy in between, and a failed load falls back to a local
 * placeholder.
 */
const AvatarImage: FC<AvatarImageProps> = memo(
  ({ url, alt, size = 'md', className, priority }) => {
    const length = AVATAR_SIZES[size];
    return (
      <Image
        src={url ?? DEFAULT_AVATAR}
        fallback={DEFAULT_AVATAR}
        alt={alt}
        priority={priority}
        referrerPolicy="no-referrer"
        draggable={false}
        className={cn(
          'aspect-square shrink-0 rounded-full border object-cover bg-app border-default',
          className,
        )}
        style={{
          width: length,
          height: length,
          minWidth: length,
          minHeight: length,
        }}
      />
    );
  },
);

AvatarImage.displayName = 'AvatarImage';

type AvatarProps = {
  user: User;
  size?: AvatarSize;
  className?: string;
  /** Render without a link to the profile. */
  disabled?: boolean;
  priority?: boolean;
};

const Avatar: FC<AvatarProps> = memo(
  ({ user, size = 'md', className, disabled = false, priority }) => {
    const image = (
      <AvatarImage
        url={user.pfpUrl}
        alt={`${user.displayName} avatar`}
        size={size}
        className={disabled ? className : undefined}
        priority={priority}
      />
    );

    if (disabled) {
      return image;
    }

    return (
      <Link
        to={paths.profile(user)}
        title={user.displayName}
        className={cn('relative inline-block h-min shrink-0', className)}
        onClick={(event) => event.stopPropagation()}
      >
        {image}
      </Link>
    );
  },
);

Avatar.displayName = 'Avatar';

export { Avatar, AVATAR_SIZES, AvatarImage, DEFAULT_AVATAR };
export type { AvatarSize };
