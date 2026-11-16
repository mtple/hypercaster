import cn from 'classnames';
import { Trash2Icon } from 'lucide-react';
import { FC, memo, ReactNode, useCallback, useEffect, useState } from 'react';

import { formatCount } from '~/hypercast/format';
import { paths } from '~/hypercast/paths';
import { useWrites } from '~/hypercast/write/WriteContext';
import { toggleBookmark, useIsBookmarked } from '~/hypersnap/bookmarks';
import type { Cast } from '~/hypersnap/types';

// --- icons (from the upstream action row) ---------------------------------

const ReplyIcon: FC = () => (
  <svg
    width="19"
    height="18"
    viewBox="0 0 19 18"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M1.625 3.09375C1.625 2.007 2.507 1.125 3.59375 1.125H15.4062C16.493 1.125 17.375 2.007 17.375 3.09375V11.5312C17.375 12.0534 17.1676 12.5542 16.7984 12.9234C16.4292 13.2926 15.9284 13.5 15.4062 13.5H10.6925L7.79787 16.3946C7.56843 16.6232 7.27646 16.7787 6.95876 16.8416C6.64106 16.9045 6.31185 16.8719 6.01263 16.748C5.71341 16.6241 5.45757 16.4144 5.27736 16.1453C5.09716 15.8762 5.00065 15.5597 5 15.2359V13.5H3.59375C3.07161 13.5 2.57085 13.2926 2.20163 12.9234C1.83242 12.5542 1.625 12.0534 1.625 11.5312V3.09375ZM3.59375 2.8125C3.51916 2.8125 3.44762 2.84213 3.39488 2.89488C3.34213 2.94762 3.3125 3.01916 3.3125 3.09375V11.5312C3.3125 11.6865 3.4385 11.8125 3.59375 11.8125H5.84375C6.06753 11.8125 6.28214 11.9014 6.44037 12.0596C6.59861 12.2179 6.6875 12.4325 6.6875 12.6562V15.12L9.7475 12.06C9.82574 11.9816 9.91867 11.9194 10.021 11.8769C10.1233 11.8344 10.233 11.8125 10.3438 11.8125H15.4062C15.4808 11.8125 15.5524 11.7829 15.6051 11.7301C15.6579 11.6774 15.6875 11.6058 15.6875 11.5312V3.09375C15.6875 3.01916 15.6579 2.94762 15.6051 2.89488C15.5524 2.84213 15.4808 2.8125 15.4062 2.8125H3.59375Z"
      className="fill-tertiary"
    />
  </svg>
);

const RecastIcon: FC<{ active: boolean }> = ({ active }) => (
  <svg
    width="19"
    height="18"
    viewBox="0 0 19 18"
    fill="none"
    aria-hidden="true"
    className={active ? '' : 'text-[#a5a5a5] dark:text-[#6a6a6a]'}
  >
    <path
      d="M2.41813 9.00562C2.5282 8.99243 2.63979 9.00106 2.74652 9.03101C2.85326 9.06096 2.95305 9.11166 3.04018 9.18019C3.12732 9.24873 3.20009 9.33377 3.25434 9.43044C3.3086 9.52712 3.34327 9.63354 3.35638 9.74362C3.49975 10.9294 3.98324 12.0483 4.7485 12.9653C5.51375 13.8823 6.52806 14.5583 7.669 14.9115C8.80994 15.2648 10.0287 15.2803 11.1783 14.9562C12.3279 14.632 13.359 13.9821 14.1474 13.0849L12.7929 11.7304C12.7534 11.691 12.7266 11.6409 12.7157 11.5863C12.7048 11.5316 12.7104 11.475 12.7317 11.4235C12.753 11.3721 12.7891 11.3281 12.8355 11.2972C12.8818 11.2663 12.9363 11.2499 12.992 11.25H17.0938C17.1683 11.25 17.2399 11.2796 17.2926 11.3324C17.3454 11.3851 17.375 11.4567 17.375 11.5312V15.633C17.3751 15.6887 17.3587 15.7432 17.3278 15.7895C17.2969 15.8359 17.2529 15.872 17.2014 15.8933C17.15 15.9146 17.0934 15.9202 17.0387 15.9093C16.9841 15.8984 16.934 15.8716 16.8946 15.8321L15.3421 14.2796C14.3288 15.3996 13.0148 16.2046 11.5568 16.5988C10.0988 16.993 8.55817 16.9597 7.11854 16.5029C5.67891 16.0461 4.40095 15.1851 3.43693 14.0224C2.47291 12.8597 1.86348 11.4443 1.68125 9.945C1.66806 9.83493 1.67668 9.72333 1.70664 9.6166C1.73659 9.50986 1.78729 9.41008 1.85582 9.32294C1.92436 9.23581 2.0094 9.16303 2.10607 9.10878C2.20275 9.05452 2.30917 9.01985 2.41925 9.00675L2.41813 9.00562ZM9.5 2.8125C8.62026 2.81157 7.75049 2.99869 6.94897 3.36132C6.14745 3.72396 5.4327 4.25372 4.85263 4.91512L6.20713 6.26962C6.24656 6.30896 6.27343 6.35912 6.28432 6.41374C6.29522 6.46836 6.28965 6.52499 6.26832 6.57644C6.24699 6.6279 6.21086 6.67186 6.16452 6.70276C6.11817 6.73366 6.0637 6.7501 6.008 6.75H1.90625C1.83166 6.75 1.76012 6.72037 1.70738 6.66762C1.65463 6.61488 1.625 6.54334 1.625 6.46875V2.367C1.6249 2.3113 1.64134 2.25682 1.67224 2.21048C1.70314 2.16414 1.7471 2.12801 1.79855 2.10668C1.85001 2.08535 1.90663 2.07978 1.96126 2.09068C2.01588 2.10157 2.06604 2.12844 2.10538 2.16787L3.65788 3.72037C4.67122 2.6004 5.98518 1.79536 7.4432 1.40118C8.90122 1.00699 10.4418 1.04029 11.8815 1.49708C13.3211 1.95388 14.5991 2.81493 15.5631 3.97763C16.5271 5.14033 17.1365 6.55566 17.3187 8.055C17.3453 8.27728 17.2825 8.50101 17.1441 8.67697C17.0057 8.85292 16.803 8.96669 16.5807 8.99325C16.3585 9.0198 16.1347 8.95697 15.9588 8.81856C15.7828 8.68016 15.6691 8.47753 15.6425 8.25525C15.4605 6.75419 14.7352 5.37173 13.6035 4.36895C12.4718 3.36617 11.0121 2.8125 9.5 2.8125Z"
      fill={active ? '#28D02C' : 'currentColor'}
    />
  </svg>
);

const HeartIcon: FC<{ active: boolean }> = ({ active }) =>
  active ? (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9.41738 16.7648L9.38813 16.7805C9.26819 16.8426 9.13508 16.8751 9 16.8751C8.86492 16.8751 8.73182 16.8426 8.61188 16.7805L8.60287 16.776L8.58263 16.7648C8.46482 16.7039 8.34853 16.6401 8.23387 16.5735C6.86271 15.7931 5.56911 14.8838 4.37063 13.8577C2.30063 12.0724 0 9.39375 0 6.1875C0 3.1905 2.34675 1.125 4.78125 1.125C6.52163 1.125 8.04712 2.02725 9 3.3975C9.95288 2.02725 11.4784 1.125 13.2188 1.125C15.6532 1.125 18 3.1905 18 6.1875C18 9.39375 15.6994 12.0724 13.6294 13.8577C12.3293 14.9693 10.9178 15.9434 9.41738 16.7648L9.39712 16.776L9.39038 16.7794H9.38813L9.41738 16.7648Z"
        className="fill-danger"
      />
    </svg>
  ) : (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9 16.0312L9.38813 16.7805C9.26819 16.8426 9.13508 16.8751 9 16.8751C8.86492 16.8751 8.73182 16.8426 8.61188 16.7805L8.60287 16.776L8.58263 16.7648C8.46482 16.7039 8.34853 16.6401 8.23387 16.5735C6.86271 15.7931 5.56911 14.8838 4.37063 13.8577C2.30062 12.0724 0 9.39375 0 6.1875C0 3.1905 2.34675 1.125 4.78125 1.125C6.52163 1.125 8.04712 2.02725 9 3.3975C9.95288 2.02725 11.4784 1.125 13.2188 1.125C15.6532 1.125 18 3.1905 18 6.1875C18 9.39375 15.6994 12.0724 13.6294 13.8577C12.3293 14.9693 10.9178 15.9434 9.41738 16.7648L9.39712 16.776L9.39038 16.7794H9.38813L9 16.0312ZM4.78125 2.8125C3.27825 2.8125 1.6875 4.122 1.6875 6.1875C1.6875 8.60625 3.465 10.8495 5.47312 12.5798C6.56874 13.5169 7.74949 14.3496 9 15.0671C10.2505 14.3496 11.4313 13.5169 12.5269 12.5798C14.535 10.8495 16.3125 8.60625 16.3125 6.1875C16.3125 4.122 14.7218 2.8125 13.2188 2.8125C11.6741 2.8125 10.2836 3.92175 9.81112 5.5755C9.76137 5.75232 9.6552 5.90804 9.50877 6.01895C9.36235 6.12986 9.18369 6.18989 9 6.18989C8.81631 6.18989 8.63765 6.12986 8.49123 6.01895C8.3448 5.90804 8.23863 5.75232 8.18888 5.5755C7.71637 3.92175 6.32587 2.8125 4.78125 2.8125Z"
        className="fill-tertiary"
      />
    </svg>
  );

const ShareIcon: FC = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M4.21875 7.31249C4.14416 7.31249 4.07262 7.34212 4.01988 7.39486C3.96713 7.44761 3.9375 7.51915 3.9375 7.59374V14.9062C3.9375 15.0615 4.0635 15.1875 4.21875 15.1875H13.7812C13.8558 15.1875 13.9274 15.1579 13.9801 15.1051C14.0329 15.0524 14.0625 14.9808 14.0625 14.9062V7.59374C14.0625 7.51915 14.0329 7.44761 13.9801 7.39486C13.9274 7.34212 13.8558 7.31249 13.7812 7.31249H12.6562C12.4325 7.31249 12.2179 7.22359 12.0596 7.06536C11.9014 6.90713 11.8125 6.69251 11.8125 6.46874C11.8125 6.24496 11.9014 6.03035 12.0596 5.87212C12.2179 5.71388 12.4325 5.62499 12.6562 5.62499H13.7812C14.868 5.62499 15.75 6.50699 15.75 7.59374V14.9062C15.75 15.4284 15.5426 15.9291 15.1734 16.2984C14.8042 16.6676 14.3034 16.875 13.7812 16.875H4.21875C3.69661 16.875 3.19585 16.6676 2.82663 16.2984C2.45742 15.9291 2.25 15.4284 2.25 14.9062V7.59374C2.25 6.50699 3.132 5.62499 4.21875 5.62499H5.34375C5.56753 5.62499 5.78214 5.71388 5.94037 5.87212C6.09861 6.03035 6.1875 6.24496 6.1875 6.46874C6.1875 6.69251 6.09861 6.90713 5.94037 7.06536C5.78214 7.22359 5.56753 7.31249 5.34375 7.31249H4.21875ZM8.80087 0.199113C8.827 0.172922 8.85804 0.152141 8.89221 0.137963C8.92638 0.123784 8.96301 0.116486 9 0.116486C9.03699 0.116486 9.07362 0.123784 9.10779 0.137963C9.14196 0.152141 9.173 0.172922 9.19913 0.199113L12.4571 3.45711C12.4966 3.49645 12.5234 3.54661 12.5343 3.60123C12.5452 3.65585 12.5396 3.71248 12.5183 3.76394C12.497 3.81539 12.4609 3.85935 12.4145 3.89025C12.3682 3.92115 12.3137 3.93759 12.258 3.93749H9.84375V10.4062C9.84375 10.63 9.75485 10.8446 9.59662 11.0029C9.43839 11.1611 9.22378 11.25 9 11.25C8.77622 11.25 8.56161 11.1611 8.40338 11.0029C8.24514 10.8446 8.15625 10.63 8.15625 10.4062V3.93749H5.742C5.6863 3.93759 5.63183 3.92115 5.58548 3.89025C5.53914 3.85935 5.50301 3.81539 5.48168 3.76394C5.46036 3.71248 5.45478 3.65585 5.46568 3.60123C5.47657 3.54661 5.50344 3.49645 5.54288 3.45711L8.80087 0.199113Z"
      className="fill-tertiary"
    />
  </svg>
);

const BookmarkIcon: FC<{ active: boolean }> = ({ active }) =>
  active ? (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3.375 3.09375C3.375 2.007 4.257 1.125 5.34375 1.125H12.6562C13.743 1.125 14.625 2.007 14.625 3.09375V16.0312C14.625 16.1912 14.5796 16.348 14.494 16.4831C14.4083 16.6183 14.286 16.7263 14.1413 16.7946C13.9966 16.8629 13.8355 16.8886 13.6767 16.8688C13.518 16.8489 13.3681 16.7844 13.2446 16.6826L9 13.1872L4.75538 16.6826C4.63177 16.7839 4.48196 16.8481 4.32336 16.8676C4.16475 16.8872 4.00384 16.8614 3.85932 16.7932C3.71479 16.725 3.59257 16.6172 3.50684 16.4823C3.42112 16.3475 3.3754 16.1911 3.375 16.0312V3.09375Z"
        fill="#8A63D2"
      />
    </svg>
  ) : (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M13.875 16.0312V16.0315C13.875 16.0493 13.87 16.0667 13.8604 16.0817C13.8509 16.0967 13.8373 16.1087 13.8213 16.1163C13.8052 16.1239 13.7873 16.1267 13.7696 16.1245C13.752 16.1223 13.7353 16.1152 13.7216 16.1039L13.7214 16.1037L9.47676 12.6083L9 12.2157L8.52324 12.6083L4.28001 16.1025C4.27987 16.1026 4.27974 16.1027 4.2796 16.1028C4.2658 16.114 4.24913 16.1211 4.23149 16.1233C4.21368 16.1255 4.19561 16.1226 4.17939 16.1149C4.16315 16.1073 4.14943 16.0952 4.1398 16.08C4.13026 16.065 4.12513 16.0476 4.125 16.0298V3.09375C4.125 2.42121 4.67121 1.875 5.34375 1.875H12.6562C13.3288 1.875 13.875 2.42121 13.875 3.09375V16.0312Z"
        stroke="#9FA3AF"
        strokeWidth="1.5"
      />
    </svg>
  );

// --- one action -----------------------------------------------------------

type CastActionProps = {
  /** Read by screen readers and shown as a tooltip. */
  label: string;
  icon: ReactNode;
  count?: number;
  /** Hide the number, as the focused cast does. */
  hideCount?: boolean;
  isActive?: boolean;
  activeClassName?: string;
  /** The control is shown but cannot be used; `label` should say why. */
  unavailable?: boolean;
  pending?: boolean;
  onClick?: () => void;
};

/**
 * An unavailable action stays focusable and announces itself as disabled,
 * rather than vanishing: the row keeps its upstream shape, and the label
 * says plainly why nothing happens.
 */
const CastAction: FC<CastActionProps> = memo(
  ({
    label,
    icon,
    count = 0,
    hideCount = false,
    isActive = false,
    activeClassName = 'text-brand',
    unavailable = false,
    pending = false,
    onClick,
  }) => {
    return (
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-disabled={unavailable || undefined}
        aria-pressed={unavailable ? undefined : isActive}
        aria-busy={pending || undefined}
        className={cn(
          'group flex w-max flex-row items-center border-0 bg-transparent p-0 text-sm text-tertiary',
          unavailable ? 'cursor-default' : 'cursor-pointer',
          pending && 'opacity-60',
        )}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!unavailable && !pending) {
            onClick?.();
          }
        }}
      >
        <div
          className={cn(
            'group flex flex-row items-center justify-center rounded-full p-2 transition-colors',
            !isActive && 'text-tertiary',
            !unavailable &&
              'hover:bg-gray-200 group-hover:bg-gray-200 dark:hover:bg-overlay-medium dark:group-hover:bg-overlay-medium',
            isActive && activeClassName,
          )}
        >
          {icon}
        </div>
        {!hideCount && count > 0 && (
          <span
            className={cn(
              'group ml-[2px] inline-flex pr-1.5 text-center text-sm transition-colors',
              !unavailable && 'group-hover:text-muted',
              isActive ? activeClassName : 'text-tertiary',
            )}
          >
            {formatCount(count)}
          </span>
        )}
      </button>
    );
  },
);
CastAction.displayName = 'CastAction';

// --- the row --------------------------------------------------------------

type CastActionsProps = {
  cast: Cast;
  isFocused?: boolean;
};

function useCopyLink(cast: Cast) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return undefined;
    }
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = useCallback(async () => {
    const url = `${window.location.origin}${paths.cast(cast)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard access denied: fall back to showing the link to copy by hand.
      window.prompt('Copy this link', url);
    }
  }, [cast]);

  return { copied, copy };
}

const CastActions: FC<CastActionsProps> = memo(
  ({ cast, isFocused = false }) => {
    const writes = useWrites();
    const { capabilities, unavailableReason } = writes;
    const engagement = writes.engagementOf(cast);
    const bookmarked = useIsBookmarked(cast.hash);
    const { copied, copy } = useCopyLink(cast);

    // Without a signed-in account the action either starts sign-in or is
    // plainly unavailable; it never pretends to have worked.
    const act = (allowed: boolean, run: () => void) =>
      allowed ? run : capabilities.canSignIn ? writes.requestSignIn : undefined;
    const blocked = (allowed: boolean) => !allowed && !capabilities.canSignIn;
    const describe = (allowed: boolean, verb: string) =>
      blocked(allowed) ? `${verb} — ${unavailableReason}` : verb;

    const reply = (
      <CastAction
        label={describe(capabilities.canReply, 'Reply')}
        icon={<ReplyIcon />}
        count={cast.repliesCount}
        hideCount={isFocused}
        unavailable={blocked(capabilities.canReply)}
        onClick={act(capabilities.canReply, () =>
          writes.openComposer({ parent: cast }),
        )}
      />
    );
    const recast = (
      <CastAction
        label={describe(
          capabilities.canRecast,
          engagement.recasted ? 'Undo recast' : 'Recast',
        )}
        icon={<RecastIcon active={engagement.recasted} />}
        count={engagement.recastsCount}
        hideCount={isFocused}
        isActive={engagement.recasted}
        activeClassName="text-success"
        unavailable={blocked(capabilities.canRecast)}
        pending={engagement.pending}
        onClick={act(capabilities.canRecast, () => writes.toggleRecast(cast))}
      />
    );
    const like = (
      <CastAction
        label={describe(
          capabilities.canLike,
          engagement.liked ? 'Unlike' : 'Like',
        )}
        icon={<HeartIcon active={engagement.liked} />}
        count={engagement.likesCount}
        hideCount={isFocused}
        isActive={engagement.liked}
        activeClassName="text-danger"
        unavailable={blocked(capabilities.canLike)}
        pending={engagement.pending}
        onClick={act(capabilities.canLike, () => writes.toggleLike(cast))}
      />
    );
    const bookmark = (
      <CastAction
        label={
          bookmarked
            ? 'Remove bookmark (saved on this device only)'
            : 'Bookmark (saved on this device only)'
        }
        icon={<BookmarkIcon active={bookmarked} />}
        isActive={bookmarked}
        onClick={() => toggleBookmark(cast.hash)}
      />
    );
    const remove = capabilities.canDeleteOwnCast &&
      cast.author.fid === writes.signedInFid && (
        <CastAction
          label="Delete cast"
          icon={<Trash2Icon size={17} className="text-tertiary" aria-hidden />}
          onClick={() => writes.deleteCast(cast)}
        />
      );
    const share = (
      <CastAction
        label={copied ? 'Link copied' : 'Copy link'}
        icon={<ShareIcon />}
        isActive={copied}
        onClick={copy}
      />
    );

    if (isFocused) {
      return (
        <div className="flex w-full flex-row items-center justify-between">
          {reply}
          {recast}
          {like}
          {bookmark}
          {share}
          {remove}
        </div>
      );
    }

    return (
      <div className="flex w-full flex-row items-center justify-between">
        {/* Upstream's fixed 112px columns wrap on a phone; share the width there. */}
        <div className="grid w-full grid-cols-3 items-center sm:grid-cols-[repeat(auto-fit,_112px)]">
          {reply}
          {recast}
          {like}
        </div>
        <div className="mr-[-8px] flex flex-row items-center gap-[8px]">
          {remove}
          {bookmark}
          {share}
        </div>
      </div>
    );
  },
);

CastActions.displayName = 'CastActions';

export { CastAction, CastActions };
