import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    // Browser tests have their own config: vitest.e2e.config.js.
    exclude: ['e2e/**', '**/node_modules/**', '**/dist/**'],
  },
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './src'),
    },
  },
});
