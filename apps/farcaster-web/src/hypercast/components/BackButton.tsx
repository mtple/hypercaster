import { ArrowLeftIcon } from '@primer/octicons-react';
import cn from 'classnames';
import { FC, memo } from 'react';

import { useCanGoBack } from '~/hooks/navigation/useCanGoBack';
import { useGoBack } from '~/hooks/navigation/useGoBack';

/**
 * Upstream's back arrow as a real button, so it can be reached and used
 * from the keyboard. Hidden when there is nowhere to go back to.
 */
const BackButton: FC<{ className?: string }> = memo(({ className }) => {
  const canGoBack = useCanGoBack();
  const goBack = useGoBack();

  if (!canGoBack) {
    return null;
  }

  return (
    <button
      type="button"
      aria-label="Back"
      onClick={goBack}
      className={cn(
        'mr-1 flex cursor-pointer flex-col items-center justify-center rounded-full p-2 text-default hover:bg-overlay-faint',
        className,
      )}
    >
      <ArrowLeftIcon size="small" />
    </button>
  );
});

BackButton.displayName = 'BackButton';

export { BackButton };
