import cn from 'classnames';
import { FC, memo } from 'react';

type LogoProps = {
  /** Edge length in pixels. */
  size?: number;
  className?: string;
};

/**
 * The Hypercast symbol: two posts and the signal passing between them.
 * Posts take the surrounding text colour; the signal is the accent.
 */
const Logo: FC<LogoProps> = memo(({ size = 24, className }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label="Hypercast"
      className={cn('shrink-0 text-default', className)}
    >
      <rect x="3" y="3" width="5" height="18" rx="2.5" fill="currentColor" />
      <rect x="16" y="3" width="5" height="18" rx="2.5" fill="currentColor" />
      <circle cx="12" cy="12" r="2.75" className="fill-brand" />
    </svg>
  );
});

Logo.displayName = 'Logo';

export { Logo };
