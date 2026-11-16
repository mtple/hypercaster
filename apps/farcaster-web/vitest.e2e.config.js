import { defineConfig } from 'vitest/config';

/**
 * End-to-end tests: the real production build, in a real browser, against
 * the local mock node. Nothing here touches a live network.
 *
 *   pnpm test:e2e
 *
 * Needs a Chromium for Playwright (`pnpm exec playwright install chromium`)
 * or HYPERCAST_E2E_CHROME set to a Chrome or Chromium binary.
 */
export default defineConfig({
  test: {
    globals: true,
    include: ['e2e/**/*.e2e.test.mjs'],
    globalSetup: ['e2e/global-setup.mjs'],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    // The tests share one mock node, so they run one file at a time.
    fileParallelism: false,
  },
});
