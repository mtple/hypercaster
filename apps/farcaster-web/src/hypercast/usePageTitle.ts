import { useEffect } from 'react';

import { config } from '~/hypersnap/config';

/** Sets the tab title to "<page> / Hypercast", or just the app name. */
function usePageTitle(title: string | null | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} / ${config.appName}` : config.appName;
  }, [title]);
}

export { usePageTitle };
