import { SearchIcon } from '@primer/octicons-react';
import cn from 'classnames';
import { FC, FormEvent, memo, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { paths, type SearchTab } from '~/hypercast/paths';

type SearchBoxProps = {
  initialQuery?: string;
  tab?: SearchTab;
  autoFocus?: boolean;
  /** Called as the text changes, for search-as-you-type on the results page. */
  onQueryChange?: (query: string) => void;
};

const isMac = () =>
  typeof navigator !== 'undefined' &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform);

/** The search field from the upstream sidebar. Enter opens the results page. */
const SearchBox: FC<SearchBoxProps> = memo(
  ({ initialQuery = '', tab = 'casts', autoFocus = false, onQueryChange }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [query, setQuery] = useState(initialQuery);
    const [isFocused, setIsFocused] = useState(false);

    // Follow the URL when the query changes from outside (back/forward).
    useEffect(() => {
      setQuery(initialQuery);
    }, [initialQuery]);

    // Cmd/Ctrl+K focuses search, as upstream.
    useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
        if (
          event.key.toLowerCase() === 'k' &&
          (isMac() ? event.metaKey : event.ctrlKey)
        ) {
          event.preventDefault();
          inputRef.current?.focus();
        }
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    const onSubmit = (event: FormEvent) => {
      event.preventDefault();
      const trimmed = query.trim();
      if (trimmed === '') {
        return;
      }
      const target = paths.search(tab, trimmed);
      if (`${location.pathname}${location.search}` !== target) {
        navigate(target);
      }
      inputRef.current?.blur();
    };

    return (
      <div className="w-full">
        <form role="search" onSubmit={onSubmit}>
          <div className="relative flex min-h-8 flex-row flex-wrap items-center gap-1">
            <SearchIcon
              className={cn(
                'absolute left-[14px] top-[9px] text-faint',
                isFocused && 'text-focused-search-icon',
              )}
            />
            <input
              type="search"
              ref={inputRef}
              value={query}
              maxLength={64}
              autoFocus={autoFocus}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Search casts, channels and users"
              placeholder="Search casts, channels and users"
              onChange={(event) => {
                setQuery(event.target.value);
                onQueryChange?.(event.target.value);
              }}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              className={cn(
                'outline-hidden w-full rounded-full border bg-input py-2 pl-10 pr-10 text-sm text-default',
                isFocused ? 'border-focused-search' : 'border-default',
                '!rounded-md border !border-surface-secondary',
              )}
            />
          </div>
        </form>
      </div>
    );
  },
);

SearchBox.displayName = 'SearchBox';

export { SearchBox };
