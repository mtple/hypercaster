import cn from 'classnames';
import { FC, memo } from 'react';

import { AVATAR_SIZES } from '~/hypercast/components/Avatar';

/** Where a cast sits in a chain of replies drawn with a connecting line. */
type ThreadPosition = 'none' | 'start' | 'middle' | 'end';

// Tied to the card's padding and avatar size: the line runs through the
// centre of the avatar column.
const SEGMENT_LEFT_OFFSET = 14 + Math.round(AVATAR_SIZES.md / 2);
const TOP_SEGMENT_HEIGHT = Math.round(AVATAR_SIZES.md / 2) + 4;

const Threadline: FC<{ threadPosition: ThreadPosition }> = memo(
  ({ threadPosition }) => {
    if (threadPosition === 'none') {
      return null;
    }
    const hasTop = threadPosition === 'middle' || threadPosition === 'end';
    const hasBottom = threadPosition === 'start' || threadPosition === 'middle';

    return (
      <>
        <div
          className={cn(
            'absolute top-0 w-[1px] border-l-2 border-tertiary',
            hasTop ? 'border-solid' : 'border-none',
          )}
          style={{ left: SEGMENT_LEFT_OFFSET, height: TOP_SEGMENT_HEIGHT }}
        />
        <div
          className={cn(
            'absolute bottom-0 w-[1px] border-l-2 border-tertiary',
            hasBottom ? 'border-solid' : 'border-none',
          )}
          style={{ left: SEGMENT_LEFT_OFFSET, top: TOP_SEGMENT_HEIGHT }}
        />
      </>
    );
  },
);

Threadline.displayName = 'Threadline';

export { Threadline };
export type { ThreadPosition };
